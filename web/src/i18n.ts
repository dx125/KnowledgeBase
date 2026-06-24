// UI chrome strings (separate from the dataset content, which is localized in the DB).
// EN is the fallback for any missing key, mirroring the backend locale rule.

export const SUPPORTED_LOCALES = ['ru', 'en', 'es', 'de'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ru';

export const LOCALE_LABELS: Record<Locale, string> = {
  ru: 'Русский',
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
};

type StringKey =
  | 'appTitle'
  | 'appSubtitle'
  | 'searchPlaceholder'
  | 'searchInTopic'
  | 'topicsHeading'
  | 'allTopics'
  | 'backToTopics'
  | 'cards'
  | 'messages'
  | 'results'
  | 'noResults'
  | 'noResultsHint'
  | 'searching'
  | 'loading'
  | 'updated'
  | 'confidence'
  | 'staleness'
  | 'needsReview'
  | 'needsReviewNote'
  | 'readMore'
  | 'readLess'
  | 'language'
  | 'configError'
  | 'configErrorHint'
  | 'errorTitle'
  | 'clear'
  | 'signIn'
  | 'signUp'
  | 'signOut'
  | 'email'
  | 'password'
  | 'authSubtitle'
  | 'signUpCheckEmail'
  | 'switchToSignUp'
  | 'switchToSignIn'
  | 'sessionLoading'
  | 'showInternal'
  | 'internalBadge'
  | 'statusReview'
  | 'statusExpert'
  | 'needsExpertNote'
  | 'limitedEvidence'
  | 'limitedEvidenceNote'
  | 'relatedInfo'
  | 'noRelated'
  | 'entitiesLabel'
  | 'glossaryLabel'
  | 'resourcesLabel'
  | 'navKnowledge'
  | 'navFaq'
  | 'faqSubtitle'
  | 'faqTopicsHeading'
  | 'searchFaqPlaceholder'
  | 'searchInFaqTopic'
  | 'backToFaqTopics'
  | 'questions';

type Dict = Record<StringKey, string>;

const en: Dict = {
  appTitle: 'Uruguay Knowledge Base',
  appSubtitle: 'Practical relocation knowledge, distilled from community chats.',
  searchPlaceholder: 'Search the knowledge base…',
  searchInTopic: 'Search in this topic…',
  topicsHeading: 'Topics',
  allTopics: 'All topics',
  backToTopics: '← All topics',
  cards: 'cards',
  messages: 'messages',
  results: 'results',
  noResults: 'Nothing found',
  noResultsHint: 'Try different keywords, or browse topics below.',
  searching: 'Searching…',
  loading: 'Loading…',
  updated: 'Updated',
  confidence: 'Confidence',
  staleness: 'Staleness',
  needsReview: 'Needs review',
  needsReviewNote: 'This information is not legally verified. Confirm with an official source or specialist.',
  readMore: 'Read more',
  readLess: 'Show less',
  language: 'Language',
  configError: 'Supabase is not configured.',
  configErrorHint: 'Copy .env.example to .env in the project root and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  errorTitle: 'Something went wrong',
  clear: 'Clear',
  signIn: 'Sign in',
  signUp: 'Create account',
  signOut: 'Sign out',
  email: 'Email',
  password: 'Password',
  authSubtitle: 'Sign in to search the knowledge base.',
  signUpCheckEmail: 'Account created. If email confirmation is on, check your inbox to finish.',
  switchToSignUp: "Don't have an account? Create one",
  switchToSignIn: 'Already have an account? Sign in',
  sessionLoading: 'Checking session…',
  showInternal: 'Show internal / unreviewed cards',
  internalBadge: 'Internal',
  statusReview: 'Needs review',
  statusExpert: 'Needs expert review',
  needsExpertNote: 'Not verified — a sensitive topic awaiting expert review. Confirm with an official source or specialist.',
  limitedEvidence: 'Limited evidence',
  limitedEvidenceNote: 'This card is weakly supported by the source messages. Treat it as a pointer, not a definitive answer.',
  relatedInfo: 'Related terms & organizations',
  noRelated: 'No related terms.',
  entitiesLabel: 'Organizations',
  glossaryLabel: 'Terms',
  resourcesLabel: 'Official resources',
  navKnowledge: 'Knowledge base',
  navFaq: 'Q&A',
  faqSubtitle: 'Answers to the questions newcomers ask most, by topic.',
  faqTopicsHeading: 'Q&A topics',
  searchFaqPlaceholder: 'Search questions & answers…',
  searchInFaqTopic: 'Search in this Q&A topic…',
  backToFaqTopics: '← All Q&A topics',
  questions: 'questions',
};

const ru: Dict = {
  appTitle: 'База знаний по Уругваю',
  appSubtitle: 'Практические знания о переезде, собранные из чатов сообщества.',
  searchPlaceholder: 'Поиск по базе знаний…',
  searchInTopic: 'Поиск внутри темы…',
  topicsHeading: 'Темы',
  allTopics: 'Все темы',
  backToTopics: '← Все темы',
  cards: 'карточек',
  messages: 'сообщений',
  results: 'результатов',
  noResults: 'Ничего не найдено',
  noResultsHint: 'Попробуйте другие ключевые слова или выберите тему ниже.',
  searching: 'Идёт поиск…',
  loading: 'Загрузка…',
  updated: 'Обновлено',
  confidence: 'Достоверность',
  staleness: 'Риск устаревания',
  needsReview: 'Требует проверки',
  needsReviewNote: 'Эта информация юридически не проверена. Уточняйте в официальных источниках или у специалиста.',
  readMore: 'Подробнее',
  readLess: 'Свернуть',
  language: 'Язык',
  configError: 'Supabase не настроен.',
  configErrorHint: 'Скопируйте .env.example в .env в корне проекта и задайте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY.',
  errorTitle: 'Что-то пошло не так',
  clear: 'Очистить',
  signIn: 'Войти',
  signUp: 'Создать аккаунт',
  signOut: 'Выйти',
  email: 'Эл. почта',
  password: 'Пароль',
  authSubtitle: 'Войдите, чтобы искать в базе знаний.',
  signUpCheckEmail: 'Аккаунт создан. Если включено подтверждение почты, проверьте письмо.',
  switchToSignUp: 'Нет аккаунта? Создайте',
  switchToSignIn: 'Уже есть аккаунт? Войти',
  sessionLoading: 'Проверка сессии…',
  showInternal: 'Показывать внутренние / непроверенные карточки',
  internalBadge: 'Внутренняя',
  statusReview: 'Нужна проверка',
  statusExpert: 'Нужна экспертная проверка',
  needsExpertNote: 'Не проверено — чувствительная тема, ожидает экспертной проверки. Уточняйте в официальных источниках или у специалиста.',
  limitedEvidence: 'Мало подтверждений',
  limitedEvidenceNote: 'Карточка слабо подтверждена исходными сообщениями. Используйте как ориентир, а не как окончательный ответ.',
  relatedInfo: 'Связанные термины и организации',
  noRelated: 'Нет связанных терминов.',
  entitiesLabel: 'Организации',
  glossaryLabel: 'Термины',
  resourcesLabel: 'Официальные ресурсы',
  navKnowledge: 'База знаний',
  navFaq: 'Вопросы и ответы',
  faqSubtitle: 'Ответы на самые частые вопросы новоприбывших, по темам.',
  faqTopicsHeading: 'Темы вопросов и ответов',
  searchFaqPlaceholder: 'Поиск по вопросам и ответам…',
  searchInFaqTopic: 'Поиск внутри темы Q&A…',
  backToFaqTopics: '← Все темы Q&A',
  questions: 'вопросов',
};

const es: Dict = {
  appTitle: 'Base de conocimiento de Uruguay',
  appSubtitle: 'Conocimiento práctico de mudanza, extraído de chats comunitarios.',
  searchPlaceholder: 'Buscar en la base de conocimiento…',
  searchInTopic: 'Buscar en este tema…',
  topicsHeading: 'Temas',
  allTopics: 'Todos los temas',
  backToTopics: '← Todos los temas',
  cards: 'tarjetas',
  messages: 'mensajes',
  results: 'resultados',
  noResults: 'No se encontró nada',
  noResultsHint: 'Prueba otras palabras clave o explora los temas.',
  searching: 'Buscando…',
  loading: 'Cargando…',
  updated: 'Actualizado',
  confidence: 'Confianza',
  staleness: 'Riesgo de obsolescencia',
  needsReview: 'Requiere revisión',
  needsReviewNote: 'Esta información no está verificada legalmente. Confírmala con una fuente oficial o un especialista.',
  readMore: 'Leer más',
  readLess: 'Mostrar menos',
  language: 'Idioma',
  configError: 'Supabase no está configurado.',
  configErrorHint: 'Copia .env.example a .env en la raíz del proyecto y define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
  errorTitle: 'Algo salió mal',
  clear: 'Limpiar',
  signIn: 'Iniciar sesión',
  signUp: 'Crear cuenta',
  signOut: 'Cerrar sesión',
  email: 'Correo',
  password: 'Contraseña',
  authSubtitle: 'Inicia sesión para buscar en la base de conocimiento.',
  signUpCheckEmail: 'Cuenta creada. Si la confirmación por correo está activada, revisa tu bandeja.',
  switchToSignUp: '¿No tienes cuenta? Crea una',
  switchToSignIn: '¿Ya tienes cuenta? Inicia sesión',
  sessionLoading: 'Verificando sesión…',
  showInternal: 'Mostrar tarjetas internas / sin revisar',
  internalBadge: 'Interna',
  statusReview: 'Requiere revisión',
  statusExpert: 'Requiere revisión experta',
  needsExpertNote: 'No verificado — tema sensible pendiente de revisión experta. Confírmalo con una fuente oficial o un especialista.',
  limitedEvidence: 'Poca evidencia',
  limitedEvidenceNote: 'Esta tarjeta tiene poco respaldo en los mensajes de origen. Tómala como orientación, no como respuesta definitiva.',
  relatedInfo: 'Términos y organizaciones relacionados',
  noRelated: 'Sin términos relacionados.',
  entitiesLabel: 'Organizaciones',
  glossaryLabel: 'Términos',
  resourcesLabel: 'Recursos oficiales',
  navKnowledge: 'Base de conocimiento',
  navFaq: 'Preguntas y respuestas',
  faqSubtitle: 'Respuestas a las preguntas más frecuentes de los recién llegados, por tema.',
  faqTopicsHeading: 'Temas de preguntas y respuestas',
  searchFaqPlaceholder: 'Buscar en preguntas y respuestas…',
  searchInFaqTopic: 'Buscar en este tema de Q&A…',
  backToFaqTopics: '← Todos los temas de Q&A',
  questions: 'preguntas',
};

const de: Dict = {
  appTitle: 'Wissensdatenbank Uruguay',
  appSubtitle: 'Praktisches Umzugswissen, destilliert aus Community-Chats.',
  searchPlaceholder: 'Wissensdatenbank durchsuchen…',
  searchInTopic: 'In diesem Thema suchen…',
  topicsHeading: 'Themen',
  allTopics: 'Alle Themen',
  backToTopics: '← Alle Themen',
  cards: 'Karten',
  messages: 'Nachrichten',
  results: 'Ergebnisse',
  noResults: 'Nichts gefunden',
  noResultsHint: 'Versuche andere Stichwörter oder durchstöbere die Themen.',
  searching: 'Suche läuft…',
  loading: 'Wird geladen…',
  updated: 'Aktualisiert',
  confidence: 'Zuverlässigkeit',
  staleness: 'Veraltungsrisiko',
  needsReview: 'Prüfung erforderlich',
  needsReviewNote: 'Diese Informationen sind rechtlich nicht geprüft. Bestätige sie mit einer offiziellen Quelle oder einem Fachmann.',
  readMore: 'Mehr lesen',
  readLess: 'Weniger anzeigen',
  language: 'Sprache',
  configError: 'Supabase ist nicht konfiguriert.',
  configErrorHint: 'Kopiere .env.example nach .env im Projektstamm und setze VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY.',
  errorTitle: 'Etwas ist schiefgelaufen',
  clear: 'Löschen',
  signIn: 'Anmelden',
  signUp: 'Konto erstellen',
  signOut: 'Abmelden',
  email: 'E-Mail',
  password: 'Passwort',
  authSubtitle: 'Melde dich an, um die Wissensdatenbank zu durchsuchen.',
  signUpCheckEmail: 'Konto erstellt. Falls E-Mail-Bestätigung aktiv ist, prüfe dein Postfach.',
  switchToSignUp: 'Kein Konto? Erstelle eines',
  switchToSignIn: 'Schon ein Konto? Anmelden',
  sessionLoading: 'Sitzung wird geprüft…',
  showInternal: 'Interne / ungeprüfte Karten anzeigen',
  internalBadge: 'Intern',
  statusReview: 'Prüfung nötig',
  statusExpert: 'Expertenprüfung nötig',
  needsExpertNote: 'Nicht verifiziert — sensibles Thema, wartet auf Expertenprüfung. Mit offizieller Quelle oder Fachmann bestätigen.',
  limitedEvidence: 'Wenig Belege',
  limitedEvidenceNote: 'Diese Karte ist durch die Quellnachrichten schwach belegt. Als Hinweis verstehen, nicht als endgültige Antwort.',
  relatedInfo: 'Verwandte Begriffe & Organisationen',
  noRelated: 'Keine verwandten Begriffe.',
  entitiesLabel: 'Organisationen',
  glossaryLabel: 'Begriffe',
  resourcesLabel: 'Offizielle Ressourcen',
  navKnowledge: 'Wissensdatenbank',
  navFaq: 'Fragen & Antworten',
  faqSubtitle: 'Antworten auf die häufigsten Fragen von Neuankömmlingen, nach Thema.',
  faqTopicsHeading: 'Fragen-&-Antworten-Themen',
  searchFaqPlaceholder: 'Fragen & Antworten durchsuchen…',
  searchInFaqTopic: 'In diesem Q&A-Thema suchen…',
  backToFaqTopics: '← Alle Q&A-Themen',
  questions: 'Fragen',
};

const DICTS: Record<Locale, Dict> = { en, ru, es, de };

export function t(locale: string, key: StringKey): string {
  const dict = DICTS[locale as Locale] ?? en;
  return dict[key] ?? en[key];
}
