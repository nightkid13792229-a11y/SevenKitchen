/**
 * 知识库标签受控词表
 *
 * 为什么需要这张表：
 *   在此之前，知识条目的 applicableTo 标签是自由填写的，写错了没有任何提示。
 *   实测后果——SAFE（食品安全）领域 7 条知识因为标签是系统永远不会产出的值，
 *   从未进入过任何一次 AI 提示词；另有 oain（应为 pain）、hepato、he 三处错字断词。
 *   本表把标签固化下来，并由 KnowledgeBaseService 在启动时强制校验。
 *
 * 两段词表的区别（重要）：
 *   · RETRIEVAL_TAGS   系统在检索时会**产出**的标签。条目只要命中其中一个，就会被自动送进 AI。
 *                      → 每条知识**必须至少有一个**本段标签，否则永远检索不到（校验会报错）。
 *   · DESCRIPTIVE_TAGS 仅用于人工分类与检索的描述性标签，系统不会自动产出。
 *                      可以随便加，但**不能靠它被自动检索到**。
 *
 * 标签一律小写（检索时也按小写比较），新增标签的规则见 docs/knowledge-base/intake-sop.md。
 */

/** 系统在检索时会产出的标签（由 deriveKnowledgeTags 产生） */
export const RETRIEVAL_TAGS: readonly string[] = [
  // 2026-10-01 新增：健康管理三个新领域的检索标签。
  // 由 deriveKnowledgeTags 无条件产出（疫苗、化验、就医时机对每一只狗都成立），
  // 食谱设计侧靠 buildPromptContext 的 purpose 过滤掉。
  'vaccine', 'immune', 'lab', 'clinical', 'red-flag', 'prevention',
  'adult', 'anemia', 'arthritis', 'blood',
  'cancer', 'cardiac', 'cardio', 'cds',
  'cie', 'ckd', 'coat', 'cognitive',
  'critical', 'dental', 'diabetes', 'diabetic',
  'endocrine', 'food-allergy', 'food-safety', 'general',
  'geriatric', 'gi', 'growth', 'heart',
  'hemo', 'hepatic', 'hospitalized', 'hyperlipidemia',
  'ibd', 'joint', 'kidney', 'lactating',
  'liver', 'low-fat', 'neuro', 'obese',
  'onco', 'oral', 'ortho', 'overweight',
  'pancreatitis', 'periodontal', 'pregnant', 'puppy',
  'renal', 'repro', 'safe', 'senior',
  'skin', 'thyroid', 'tumor', 'underweight',
  'urinary', 'urolith', 'weight-gain', 'weight-loss',
];

/** 仅用于人工分类的描述性标签（系统不会产出，不能作为唯一标签） */
export const DESCRIPTIVE_TAGS: readonly string[] = [
  'active', 'acute-gastroenteritis', 'acute-pancreatitis', 'all',
  'anorexia', 'antioxidant', 'arginine', 'ascites',
  'assessment', 'atopy', 'bitch', 'brain-aging',
  'breed', 'breed-risk', 'breeding', 'cachexia',
  'calcium-phosphate', 'cardiac-risk', 'cardiovascular', 'caries',
  'cat', 'chemotherapy', 'chf', 'cholestasis',
  'chronic-disease', 'chronic-enteropathy', 'chronic-pancreatitis', 'chylothorax',
  'ckd-risk', 'coagulation', 'cobalamin', 'cognitive-dysfunction',
  'compound', 'constipation', 'copper', 'copper-toxicosis',
  'cushing', 'cystine', 'dcm', 'dermatitis',
  'diagnosis', 'diarrhea', 'diet-trial', 'dietary-management',
  'differential', 'dka', 'dog', 'eclampsia',
  'edema', 'elimination-diet', 'enteral-nutrition', 'epi',
  'fatty-acid', 'feline', 'feline-liver', 'fiber-responsive',
  'fish-oil', 'foodborne', 'fresh-food', 'gestation',
  'gi-diet', 'giant-breed-puppy', 'gingivitis', 'gut',
  'hepatic-encephalopathy', 'hepatorenal-caution', 'high-fat-diet', 'high-triglycerides',
  'homemade', 'hydration', 'hyperadrenocorticism', 'hyperglycemia',
  'hyperphosphatemia', 'hypertension', 'hyperthyroid', 'hyperthyroidism',
  'hypoalbuminemia', 'hypothyroid', 'hypothyroidism', 'illness',
  'inflammation', 'iron-deficiency', 'itching', 'keratinization',
  'ketoacidosis', 'large-bowel', 'large-breed-puppy', 'lipidosis',
  'liver-disease', 'lymphangiectasia', 'maintenance', 'malnutrition',
  'medium-breed-puppy', 'monitoring', 'muscle-loss', 'mycotoxin',
  'neonatal-puppy', 'neoplasia', 'neutered', 'npo',
  'nutritional', 'nutritional-anemia', 'obesity', 'older-dog',
  'osteoarthritis', 'otitis', 'oxalate', 'pain',
  'parenteral-nutrition', 'periodontitis', 'ple', 'portosystemic-shunt',
  'protein', 'proteinuria', 'pruritus', 'pss',
  'pufa', 'radiation', 'raw', 'recovery',
  'relapse', 'reproduction', 'risk', 'seborrhea',
  'sedentary', 'sepsis', 'sibo', 'silica',
  'small-breed-puppy', 'small-frequent-meals', 'stones', 'struvite',
  'supplement', 'supplements', 'surgery', 'systemic',
  'taurine', 'trace-mineral', 'trauma', 'urate',
  'vitamin-a', 'vitamin-e', 'vomiting', 'weaning',
  'weight', 'wound-healing', 'zinc',
];

/** 完整受控词表 */
export const KNOWLEDGE_TAG_VOCABULARY: readonly string[] = [
  ...RETRIEVAL_TAGS,
  ...DESCRIPTIVE_TAGS,
];

const RETRIEVAL_SET = new Set(RETRIEVAL_TAGS.map((tag) => tag.toLowerCase()));
const VOCABULARY_SET = new Set(
  KNOWLEDGE_TAG_VOCABULARY.map((tag) => tag.toLowerCase()),
);

/** 是否为系统会自动产出的检索标签 */
export function isRetrievalTag(tag: string): boolean {
  return RETRIEVAL_SET.has(tag.trim().toLowerCase());
}

/** 是否在受控词表内 */
export function isKnownTag(tag: string): boolean {
  return VOCABULARY_SET.has(tag.trim().toLowerCase());
}
