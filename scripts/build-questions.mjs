// =============================================================================
// Regenerate dataset-patches/questions.json from the Q&A answer-cards + raw chat.
//
//   node build-questions.mjs                 # uses MESSAGES_FILE env or the default path
//   MESSAGES_FILE=/path/messages.jsonl node build-questions.mjs
//
// Model (mirrors the upstream questions.json: questions reference answer-cards,
// no duplicated answer text):
//   * Each Q&A answer lives ONCE as a card (the topic.faq_* cards in faq.json).
//   * Each question references its answer card via `answer_card_id`, carries the
//     localized phrasings, and an `ask_frequency` — a best-effort, REPRODUCIBLE
//     count of how often that question (by meaning) shows up in the source chat.
//
// ask_frequency method (documented for recreation):
//   1. Stream the raw Telegram export; keep "question-like" messages (contain '?'
//      or start with/contain a Russian interrogative).
//   2. For each answer-card, derive probe terms from its RU title (content words
//      > 3 chars, minus stopwords, plus any latin tokens like prex/sas/itau).
//   3. ask_frequency = number of question-messages matching >= MIN_HITS probes
//      (1 if the card has a single probe). Counts may overlap across cards; this
//      is a relative-demand signal, not a partition.
// If the raw file is absent, existing ask_frequency values in questions.json are
// preserved so the file stays reproducible offline.
// =============================================================================
import { readFileSync, writeFileSync, existsSync, createReadStream } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const HERE = dirname(fileURLToPath(import.meta.url));
const FAQ_PATH = join(HERE, '..', 'dataset-patches', 'faq.json');
const OUT_PATH = join(HERE, '..', 'dataset-patches', 'questions.json');
const MESSAGES_FILE =
  process.env.MESSAGES_FILE ||
  'D:/Code/MyGitRepos/Settle/tools/telegram-export/exports/general/messages.jsonl';

const LOCALES = ['ru', 'en', 'es', 'de'];
const MIN_HITS = 2;

const STOP = new Set(
  ('и в во не на я с со что а то по он но они мы за из у её его как так от о бы для это эту этот вы ты же ну да нет ' +
    'или ли есть быть к до там тут вот при про над под уже ещё их кто чем кому если когда здесь очень можно нужно надо ' +
    'чтобы потом просто тоже также всё все весь вся пожалуйста подскажите спасибо здравствуйте всем привет добрый день ' +
    'который которые свою свои мне меня тебя нам вам им них тех том этом эти этих такое такой какие какой какая сколько ' +
    'где куда чего нужна нужен нужно зачем нибудь между без для про чём оно ваш ваша если ')
    .split(/\s+/)
    .filter(Boolean),
);

const QWORDS = ['как', 'где', 'какой', 'какая', 'какие', 'сколько', 'можно ли', 'кто', 'что', 'когда', 'почему', 'зачем', 'нужно ли', 'стоит ли', 'подскажите', 'посоветуйте', 'реально ли', 'есть ли', 'куда', 'подскажете'];
const isQuestion = (t) => t.includes('?') || QWORDS.some((w) => { const l = t.toLowerCase(); return l.startsWith(w + ' ') || l.includes(' ' + w + ' '); });

function probesFromTitle(title) {
  const toks = (title || '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9 ]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
  return [...new Set(toks)];
}

async function countFrequencies(cards) {
  if (!existsSync(MESSAGES_FILE)) {
    console.warn(`⚠ messages file not found (${MESSAGES_FILE}); preserving existing ask_frequency values.`);
    return null;
  }
  const probes = cards.map((c) => ({ id: c.card_id, p: probesFromTitle(c.text?.ru?.title) }));
  const counts = Object.fromEntries(probes.map((x) => [x.id, 0]));
  const rl = readline.createInterface({ input: createReadStream(MESSAGES_FILE), crlfDelay: Infinity });
  let total = 0, q = 0;
  for await (const line of rl) {
    total++;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const text = (o.text || '').trim();
    if (!text || text.length < 10 || text.length > 600 || !isQuestion(text)) continue;
    q++;
    const low = text.toLowerCase();
    for (const { id, p } of probes) {
      if (!p.length) continue;
      const need = Math.min(MIN_HITS, p.length);
      let hits = 0;
      for (const term of p) { if (low.includes(term)) { hits++; if (hits >= need) break; } }
      if (hits >= need) counts[id]++;
    }
  }
  console.log(`Scanned ${total} msgs · ${q} question-like.`);
  return counts;
}

const faq = JSON.parse(readFileSync(FAQ_PATH, 'utf-8'));
const cards = faq.questions ?? [];
const prev = existsSync(OUT_PATH) ? JSON.parse(readFileSync(OUT_PATH, 'utf-8')) : { questions: [] };
const prevFreq = Object.fromEntries((prev.questions ?? []).map((q) => [q.answer_card_id, q.ask_frequency]));

const counts = await countFrequencies(cards);

// card.faq_taxes.q06_x  ->  q.faq_taxes.q06_x
const qid = (cardId) => 'q.' + cardId.replace(/^card\./, '');

const questions = cards
  .map((c) => ({
    question_id: qid(c.card_id),
    answer_card_id: c.card_id,
    topic_id: c.topic_id,
    ask_frequency: counts ? counts[c.card_id] ?? 0 : prevFreq[c.card_id] ?? c.ask_signal ?? 0,
    locales: Object.fromEntries(
      LOCALES.map((l) => [l, [c.text?.[l]?.title].filter(Boolean)]),
    ),
  }))
  .sort((a, b) => b.ask_frequency - a.ask_frequency);

const out = {
  schema_version: '1.0.0',
  generated_at: new Date().toISOString(),
  source_messages: existsSync(MESSAGES_FILE) ? MESSAGES_FILE : null,
  method:
    'ask_frequency = count of question-like source messages matching >=2 probe terms (1 if a single probe) derived from each answer-card RU title; counts overlap across cards (relative-demand signal). See scripts/build-questions.mjs.',
  count: questions.length,
  questions,
};
writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n', 'utf-8');
console.log(`Wrote ${questions.length} questions -> ${OUT_PATH}`);
console.log('Top 10 most-asked:');
for (const q of questions.slice(0, 10)) console.log(`  ${String(q.ask_frequency).padStart(5)}  ${q.locales.ru[0]}`);
