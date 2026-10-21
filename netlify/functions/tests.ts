import type { Config, Context } from '@netlify/functions'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { tests } from '../../db/schema.js'

const HISTORY_LIMIT = 200
const MAX_REPORT_BYTES = 256 * 1024
const CLIENT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Everything the comparison needs, without the bulky per-second samples and key stats.
const summary = {
  id: tests.id,
  createdAt: tests.createdAt,
  duration: tests.duration,
  practice: tests.practice,
  scaled: tests.scaled,
  net: tests.net,
  raw: tests.raw,
  accuracy: tests.accuracy,
  consistency: tests.consistency,
  startLevel: tests.startLevel,
  finalLevel: tests.finalLevel,
  peakLevel: tests.peakLevel,
  slowWords: sql`coalesce(${tests.report}->'slowWords', '[]'::jsonb)`.as('slow_words'),
}

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const level = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 11

function validReport(r: any) {
  return (
    r && typeof r === 'object' &&
    Number.isInteger(r.duration) && r.duration > 0 && r.duration <= 600 &&
    ['scaled', 'net', 'raw', 'accuracy', 'consistency'].every((k) => num(r[k])) &&
    level(r.startLevel) && level(r.finalLevel) && level(r.peakLevel) &&
    Array.isArray(r.samples) && Array.isArray(r.slowWords) && Array.isArray(r.levelChanges)
  )
}

const bad = (msg: string, status = 400) => Response.json({ error: msg }, { status })

export default async (req: Request, context: Context) => {
  const clientId = req.headers.get('x-typify-client') ?? ''
  if (!CLIENT_RE.test(clientId)) return bad('missing or invalid client id')
  const id = context.params.id ? Number(context.params.id) : null
  if (id !== null && !Number.isInteger(id)) return bad('invalid id')
  const mine = eq(tests.clientId, clientId)

  if (req.method === 'GET' && id === null) {
    const rows = await db.select(summary).from(tests).where(mine).orderBy(desc(tests.createdAt)).limit(HISTORY_LIMIT)
    return Response.json(rows)
  }

  if (req.method === 'GET') {
    const [row] = await db.select({ ...summary, report: tests.report }).from(tests).where(and(mine, eq(tests.id, id!)))
    return row ? Response.json(row) : bad('not found', 404)
  }

  if (req.method === 'POST' && id === null) {
    const body = await req.text()
    if (body.length > MAX_REPORT_BYTES) return bad('report too large', 413)
    let r
    try {
      r = JSON.parse(body)
    } catch {
      return bad('invalid json')
    }
    if (!validReport(r)) return bad('invalid report')
    const [row] = await db
      .insert(tests)
      .values({
        clientId,
        duration: r.duration,
        practice: !!r.practice,
        scaled: r.scaled,
        net: r.net,
        raw: r.raw,
        accuracy: r.accuracy,
        consistency: r.consistency,
        startLevel: r.startLevel,
        finalLevel: r.finalLevel,
        peakLevel: r.peakLevel,
        report: r,
      })
      .returning(summary)
    return Response.json(row, { status: 201 })
  }

  if (req.method === 'DELETE') {
    await db.delete(tests).where(id === null ? mine : and(mine, eq(tests.id, id)))
    return new Response(null, { status: 204 })
  }

  return bad('method not allowed', 405)
}

export const config: Config = {
  path: ['/api/tests', '/api/tests/:id'],
}
