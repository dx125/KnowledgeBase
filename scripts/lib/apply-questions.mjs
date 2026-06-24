// =============================================================================
// Normalized Q&A layer loader (companion to apply-faq.mjs).
//
// Reads dataset-patches/questions.json (questions that REFERENCE answer-cards,
// with localized phrasings + ask_frequency) and builds the rows for the
// `questions` / `question_translations` tables. Answers are never duplicated
// here — each question only points at its answer card via `answer_card_id`.
//
// FK-safe: a question whose answer_card_id is not among the built cards is
// dropped (so a removed/renamed answer card can't break the deploy).
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';

const LOCALES = ['ru', 'en', 'es', 'de'];

export function applyQuestions({ cards, questionsPath }) {
  const stats = { added: 0, droppedNoCard: [] };
  const questionRows = [];
  const questionTrRows = [];
  if (!existsSync(questionsPath)) return { questionRows, questionTrRows, stats };

  const data = JSON.parse(readFileSync(questionsPath, 'utf-8'));
  const cardIds = new Set(cards.map((c) => c.card_id));

  for (const q of data.questions ?? []) {
    if (!cardIds.has(q.answer_card_id)) { stats.droppedNoCard.push(q.question_id); continue; }
    questionRows.push({
      question_id: q.question_id,
      answer_card_id: q.answer_card_id,
      topic_id: q.topic_id ?? null,
      ask_frequency: q.ask_frequency ?? 0,
      status: q.status ?? 'active',
      visibility: q.visibility ?? 'public',
    });
    for (const loc of LOCALES) {
      const phrasings = (q.locales?.[loc] ?? []).filter(Boolean);
      if (!phrasings.length) continue;
      questionTrRows.push({ question_id: q.question_id, locale: loc, phrasings });
    }
    stats.added++;
  }
  return { questionRows, questionTrRows, stats };
}
