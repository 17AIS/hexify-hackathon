// All levelling tunables live here. `startLevel` is where every test begins.
// `promoteSteps` is checked from the top: hold a rolling WPM of `wpm` or more for
// `sustainSeconds` and you jump up by `levels`. Below level 10, `demoteSteps` is
// checked from the bottom: hold the rolling WPM `under` (strictly below) a speed
// for the same time and you drop by `levels`. 65–69 WPM holds your level.
//
// Level 10 has its own rule: you stay there at 100 WPM, and 90–99 is a grace band
// that also keeps you there. `topDemoteSteps` is checked from the bottom: hold the
// rolling WPM `under` (strictly below) or `atMost` (at or below) a speed and you
// drop by `levels`. Promotion is off while you're at level 10.
export const CONFIG = {
  promoteSteps: [
    { wpm: 140, levels: 3 },
    { wpm: 100, levels: 2 },
    { wpm: 70, levels: 1 },
  ],
  demoteSteps: [
    { under: 20, levels: 3 },
    { under: 40, levels: 2 },
    { under: 65, levels: 1 },
  ],
  topDemoteSteps: [
    { atMost: 40, levels: 5 },
    { atMost: 60, levels: 2 },
    { under: 90, levels: 1 },
  ],
  sustainSeconds: 5,
  cooldownSeconds: 3,
  windowSeconds: 5,
  startLevel: 3,
}

// Words on screen ahead of the caret, current word included. Each committed word
// is replaced by a fresh one at the end of the line, sampled at the target level.
export const WORDS_AHEAD = 5
export const MIN_LEVEL = 1
export const MAX_LEVEL = 10

// Level 11 isn't on the ramp: it's a practice session built from your slowest
// words and their lookalikes. Levelling is switched off while it runs.
export const PRACTICE_LEVEL = 11
export const PRACTICE_LABEL = 'Nemesis'
export const TIME_MODES = [5, 15, 30, 60, 120]
export const DEFAULT_TIME = 30

export const LEVELS = [
  { level: 1, label: "Home Row", words: [
    "an","at","be","do","go","if","in","is","it","me",
    "no","of","on","or","so","to","up","us","we","my",
    "cat","dog","sun","run","the","and","box","cup","pen","hat",
    "map","red","big","top","fox","bed","cow","eat","fly","gum",
    "ice","jar","key","log","mud","net","oak","pig","sky","van" ] },

  { level: 2, label: "Four Count", words: [
    "bird","cake","desk","farm","gate","hand","jump","kite","lamp","milk",
    "nest","open","path","quiz","ring","sand","trip","vote","wind","yard",
    "zone","boat","clay","drum","fish","gold","horn","iron","lake","moth",
    "nail","oval","pond","rose","ship","time","wolf","aunt","crab","dusk",
    "clock","stamp","brush","chalk","frown" ] },

  { level: 3, label: "Full Reach", words: [
    "about","brave","chair","dance","eagle","flame","grape","horse","house","judge",
    "knife","light","mouse","north","ocean","plant","quiet","river","stone","table",
    "under","vocal","water","zebra","bread","cloud","drive","earth","frost","ghost",
    "heart","index","lemon","magic","noble","organ","pride","quick","ranch","sword",
    "bridge","castle","flight","garlic","pocket" ] },

  { level: 4, label: "Clean Run", words: [
    "anchor","basket","candle","dragon","engine","forest","garden","harbour","island","jacket",
    "kitchen","lantern","marble","nature","orchid","pencil","quartz","rocket","silver","temple",
    "urgent","velvet","wizard","blanket","comrade","diamond","granite","hunter","jungle","kernel",
    "meadow","planet","resort","signal","thunder","violin","walnut","yoghurt","zenith","cobalt" ] },

  { level: 5, label: "Stutter", words: [
    "bottle","butter","coffee","kennel","muffin","pepper","soccer","village","waffles","ballast",
    "goggles","kittens","blizzard","scissors","slippery","stuffing",
    "archive","bracket","crystal","dolphin","fixture","glimpse","harvest","journey","lobster","mystery",
    "network","outcast","pigment","quintet","rhythms","tangles","upgrade","vintage","whisper","zealots",
    "dentist","fabrics","inspect","machine","orbital","pelican" ] },

  { level: 6, label: "Doubled Up", words: [
    "accurate","bubbling","collapse","dazzling","effected","grappled","huddling","illusion","juggling","knitting",
    "littered","occupied","rattling","scrubbed","shuffled","swelling","trappers","umbrella","wobbling","zeppelin",
    "brochure","chemical","dialogue","dramatic","envelope","fragment","hospital","incubate","keyboard","lavender",
    "magnetic","nostalgia","obstacle","pharmacy","quantify","sandwich","triangle","upstairs","vertical","workshop" ] },

  { level: 7, label: "Long Haul", words: [
    "accordion","aggregate","bassoonist","buttercup","cappuccino","commodore","corruption","differing","dissipate","ebullient",
    "flippancy","gossamers","hallmarks","immersion","innkeeper","jettisons","mozzarella","narrative","oppressed","parallels",
    "quizzical","raspberry","scaffolds","tollbooths","vaccinate","wallflower","yellowish",
    "amplitude","barometer","cognitive","duplicate","framework","gymnastic","hexagonal","inventory","lubricant","mandolin",
    "nocturnal","pavilion","quadrants" ] },

  { level: 8, label: "Bookkeeper", words: [
    "accommodate","aggressively","annihilated","assassinated","ballyhooed","bookkeeping","bottleneck","buffoonery","cappuccinos","committee",
    "connoisseur","disappeared","effervesce","embarrassed","flabbergast","grasshopper","hullabaloo","illiterate","interrupted","jackhammers",
    "kettledrums","lollipops","marshmallow","millennium","noncommittal","occurrence","paralleled","possessive","quizzically","reassessment",
    "shrubberies","troubleshoot","unnecessary","vacuuming","wheelbarrow","willingness","zucchinis","razzmatazz","whippoorwill","bellyflopped" ] },

  { level: 9, label: "Polysyllabic", words: [
    "accommodating","accoutrements","bibliographies","bioluminescent","cannibalistic","defenestration","discombobulate","ebulliently","effervescence","effortlessly",
    "gallimaufry","gobbledygook","hippopotamus","hullabaloos","illegitimacy","immeasurable","interstellar","irresistible","mellifluous","nonnegotiable",
    "parallelogram","questionnaire","unparalleled","unsuccessfully","whippersnapper","wilfulness","zoomorphism","quintessential",
    "anthropomorphic","idiosyncratic","juxtaposition","kaleidoscopic","labyrinthine","machicolation","obstreperous","perpendicular","rambunctious",
    "rendezvousing","serendipitous","verisimilitude" ] },

  { level: 10, label: "Sesquipedalian", words: [
    "accomplishments","bioaccumulation","callipygian","defibrillator","disillusionment","flibbertigibbet","hippopotamuses","immunoglobulin","immunosuppressed","irreconcilable",
    "knickknacks","mellifluousness","misapprehensions","noncommittally","onomatopoeically","parallelepiped","quadricentennial","razzmatazzes","recommendations","subcommittees",
    "unflappability","verisimilitudes","whippersnappers",
    "brachycephalic","chrysanthemums","circumambulate","deoxyribonucleic","electroencephalogram","epistemological","grandiloquently","heterogeneously","hydrochlorofluorocarbon",
    "incomprehensibility","indefatigability","interdisciplinary","magnetohydrodynamics","otorhinolaryngology","pharmacokinetics","phosphorescently","polytetrafluoroethylene",
    "sesquipedalian","spectrophotometer","thermoluminescence","transubstantiation","uncharacteristically","xerophthalmia","zoogeographical",
    "defragging","exothermal","particularise","knoxvillite","phrenotropic" ] },
];

export const levelLabel = (level) => (level === PRACTICE_LEVEL ? PRACTICE_LABEL : LEVELS[level - 1].label)

// Bodies of literature for the results payoff, smallest to largest.
export const TEXTS = [
  { title: 'a tweet', note: '280 characters', words: 55, italic: false },
  { title: 'The Gettysburg Address', words: 272, italic: false },
  { title: 'Animal Farm', words: 29966, italic: true },
  { title: 'The Great Gatsby', words: 47094, italic: true },
  { title: 'Moby-Dick', words: 206052, italic: true },
  { title: 'War and Peace', words: 587287, italic: true },
]

// Average English word: 4.7 letters + 1 space.
export const CHARS_PER_REAL_WORD = 5.7
