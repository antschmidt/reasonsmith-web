/**
 * Rhetorical Analysis Utility
 *
 * Detects logical fallacies and manipulative/cultish language patterns
 * in argument node content. Returns structured alerts with severity,
 * category, and explanations for display on NodeCards.
 */

import type { ArgumentNodeType } from '$lib/types/argument';

// ============================================
// Types
// ============================================

export type AlertCategory = 'fallacy' | 'manipulative' | 'cultish' | 'weak';

export type AlertSeverity = 'info' | 'warning' | 'error';

export interface RhetoricalAlert {
	/** Unique key for this alert type */
	id: string;
	/** Display label */
	label: string;
	/** Short explanation shown in tooltip */
	description: string;
	/** Longer explanation with guidance */
	explanation: string;
	/** Category of the issue */
	category: AlertCategory;
	/** How serious this is */
	severity: AlertSeverity;
	/** Icon hint (used by the component to pick an icon) */
	icon: 'alert-triangle' | 'shield-alert' | 'eye' | 'help-circle' | 'brain' | 'target';
	/** The matched pattern text (for highlighting) */
	matchedText?: string;
}

interface PatternRule {
	id: string;
	label: string;
	description: string;
	explanation: string;
	category: AlertCategory;
	severity: AlertSeverity;
	icon: RhetoricalAlert['icon'];
	/** Regex patterns to match (case-insensitive). Any match triggers the alert. */
	patterns: RegExp[];
	/** Optional: only apply to certain node types */
	nodeTypes?: ArgumentNodeType[];
	/** Optional: minimum content length to even bother checking */
	minLength?: number;
}

// ============================================
// Pattern Definitions
// ============================================

const PATTERN_RULES: PatternRule[] = [
	// ─────────────────────────────────────────
	// LOGICAL FALLACIES
	// ─────────────────────────────────────────
	{
		id: 'ad_hominem',
		label: 'Ad Hominem',
		description: 'Attacks the person rather than the argument',
		explanation:
			'An ad hominem fallacy attacks the character, motive, or attributes of the person making the argument rather than addressing the substance of the argument itself. Focus on what is being said, not who is saying it.',
		category: 'fallacy',
		severity: 'warning',
		icon: 'alert-triangle',
		patterns: [
			/\b(?:you(?:'re| are) (?:just |clearly |obviously )?(?:an? )?(?:idiot|fool|moron|stupid|ignorant|naive|clueless|incompetent))\b/i,
			/\bwhat (?:do |would |could )you know about\b/i,
			/\b(?:people like (?:you|them|him|her))\b/i,
			/\b(?:of course (?:you|they) would say that)\b/i,
			/\b(?:consider the source|source is (?:biased|untrustworthy|unreliable))\b/i,
			/\b(?:can'?t be trusted because)\b/i,
			/\b(?:typical (?:liberal|conservative|leftist|rightist|democrat|republican))\b/i,
			/\b(?:what do you expect from)\b/i
		]
	},
	{
		id: 'straw_man',
		label: 'Straw Man',
		description: 'Misrepresents the opposing position to make it easier to attack',
		explanation:
			'A straw man fallacy involves distorting or exaggerating someone else\'s argument to make it easier to refute. Phrases like "so you\'re saying" followed by an extreme version of the claim, or "they want to" followed by a distortion, are common indicators. Engage with the actual argument being made.',
		category: 'fallacy',
		severity: 'warning',
		icon: 'alert-triangle',
		patterns: [
			/\bso (?:you(?:'re| are)|they(?:'re| are)) (?:basically |essentially |really )?saying\b/i,
			/\b(?:what they really (?:mean|want))\b/i,
			/\b(?:they (?:basically |essentially )?want (?:to (?:destroy|eliminate|ban|abolish|end|get rid of)))\b/i,
			/\b(?:in other words,? (?:you|they) (?:think|believe|want))\b/i,
			/\b(?:that'?s (?:like|the same as) saying)\b/i
		],
		nodeTypes: ['counter', 'rebuttal', 'claim']
	},
	{
		id: 'false_dilemma',
		label: 'False Dilemma',
		description: 'Presents only two options when more exist',
		explanation:
			'A false dilemma (or false dichotomy) presents a situation as having only two possible options when in reality there are more nuanced positions or alternatives available. Look for middle ground or additional options.',
		category: 'fallacy',
		severity: 'warning',
		icon: 'alert-triangle',
		patterns: [
			/\b(?:either[\s\S]{1,40}or(?! more| less| fewer| greater))\b/i,
			/\b(?:you(?:'re| are) either (?:with|for) us or (?:against|with) (?:us|them))\b/i,
			/\b(?:there (?:are|is) (?:only )?two (?:choices|options|ways|paths|sides))\b/i,
			/\b(?:you (?:can either|have (?:two|only two) (?:choices|options)))\b/i,
			/\b(?:if (?:you(?:'re| are)|we(?:'re| are)) not[\s\S]{1,20}then (?:you(?:'re| are)|we(?:'re| are)))\b/i,
			/\b(?:it(?:'s| is) (?:either|simple|binary|black and white|one or the other))\b/i
		]
	},
	{
		id: 'appeal_to_authority',
		label: 'Appeal to Authority',
		description: 'Claims something is true because an authority figure said so',
		explanation:
			'An appeal to authority fallacy occurs when a claim is considered true simply because an authority figure endorses it, especially when the authority is not an expert in the relevant field. Expert opinion can be valuable evidence, but it should be supported by data and reasoning, not treated as proof by itself.',
		category: 'fallacy',
		severity: 'info',
		icon: 'help-circle',
		patterns: [
			/\b(?:experts? (?:say|agree|believe|confirm|have (?:shown|confirmed|proven)))\b/i,
			/\b(?:(?:scientists|doctors|economists|researchers|professors|studies) (?:say|agree|show|prove|confirm|have (?:shown|confirmed|proven)) that)\b/i,
			/\b(?:according to (?:experts?|authorities|officials))\b/i,
			/\b(?:even [\w\s]+ (?:agrees?|admits?|says?))\b/i,
			/\b(?:(?:a|the) (?:leading|top|prominent|renowned|famous|well-known) (?:expert|scientist|doctor|researcher|professor|authority) (?:says?|stated?|confirmed?|agrees?))\b/i
		],
		nodeTypes: ['evidence', 'claim', 'warrant']
	},
	{
		id: 'appeal_to_emotion',
		label: 'Appeal to Emotion',
		description: 'Uses emotional manipulation instead of logical reasoning',
		explanation:
			'An appeal to emotion attempts to persuade through emotional response rather than logical argument. While emotions are valid, they should complement — not replace — evidence and reasoning. Check whether the emotional language is masking a lack of substantive support.',
		category: 'fallacy',
		severity: 'warning',
		icon: 'alert-triangle',
		patterns: [
			/\b(?:think of the children|won'?t someone think of)\b/i,
			/\b(?:how (?:can|could|dare) (?:you|they|we|anyone))\b/i,
			/\b(?:it(?:'s| is| would be) (?:heartbreaking|devastating|terrifying|horrifying|sickening|disgusting|outrageous|shameful|unforgivable))\b/i,
			/\b(?:any (?:decent|caring|reasonable|sane|rational) person (?:would|should|must|can see))\b/i,
			/\b(?:(?:you|they) should be (?:ashamed|embarrassed|afraid|terrified|outraged))\b/i,
			/\b(?:blood (?:on (?:your|their|his|her) hands|will be on))\b/i
		],
		nodeTypes: ['claim', 'evidence', 'warrant', 'counter', 'rebuttal']
	},
	{
		id: 'slippery_slope',
		label: 'Slippery Slope',
		description: 'Assumes one event will inevitably lead to extreme consequences',
		explanation:
			'A slippery slope fallacy argues that one action will inevitably lead to a chain of increasingly extreme consequences without providing evidence for each step in the chain. Each causal link should be evaluated independently.',
		category: 'fallacy',
		severity: 'warning',
		icon: 'alert-triangle',
		patterns: [
			/\b(?:(?:this |it )?will (?:inevitably |eventually |ultimately )?lead to)\b/i,
			/\b(?:next (?:thing you know|they(?:'ll| will)))\b/i,
			/\b(?:where (?:does|will) it (?:end|stop))\b/i,
			/\b(?:open(?:s|ing)? the (?:door|gate|floodgates?) (?:to|for))\b/i,
			/\b(?:it(?:'s| is) (?:a |the )?(?:slippery slope|thin end of the wedge|beginning of the end))\b/i,
			/\b(?:before (?:you|we) know it)\b/i,
			/\b(?:first[\s\S]{1,30}then[\s\S]{1,30}(?:next|soon|eventually|before long))\b/i
		]
	},
	{
		id: 'circular_reasoning',
		label: 'Circular Reasoning',
		description: 'The conclusion is assumed in the premise',
		explanation:
			'Circular reasoning (begging the question) occurs when the conclusion of an argument is assumed or restated in one of its premises. The argument essentially says "X is true because X is true" in different words. Look for independent evidence that doesn\'t merely restate the claim.',
		category: 'fallacy',
		severity: 'error',
		icon: 'alert-triangle',
		patterns: [
			/\b(?:(?:it |this )is (?:true|correct|right|valid) because (?:it |this )is (?:true|correct|right|valid))\b/i,
			/\b(?:the (?:reason|proof|evidence) (?:is|being) that)\b.*\b(?:which (?:proves?|shows?|demonstrates?) (?:that |it ))/i,
			/\b(?:we know this because)\b.*\b(?:which (?:is why|tells us|means))\b/i,
			/\b(?:by definition)\b/i
		],
		nodeTypes: ['warrant', 'claim'],
		minLength: 20
	},
	{
		id: 'hasty_generalization',
		label: 'Hasty Generalization',
		description: 'Draws broad conclusions from limited examples',
		explanation:
			'A hasty generalization draws a broad conclusion from a small or unrepresentative sample. Phrases like "everyone knows" or "all X are Y" based on limited experience indicate this fallacy. Look for the actual sample size and whether it represents the full population.',
		category: 'fallacy',
		severity: 'warning',
		icon: 'alert-triangle',
		patterns: [
			/\b(?:(?:everyone|everybody|nobody|no one|all people|all (?:of them|women|men)) (?:knows?|thinks?|believes?|agrees?|wants?))\b/i,
			/\b(?:they (?:always|never))\b/i,
			/\b(?:(?:all|every|each and every) (?:\w+ )?(?:are|is|do|does|have|has|will|would))\b/i,
			/\b(?:(?:I|we) (?:saw|met|know|heard) (?:a|one|two|some|a few) [\w\s]+(?:so|therefore|which (?:means|proves|shows)))\b/i,
			/\b(?:without exception)\b/i,
			/\b(?:it(?:'s| is) (?:a )?(?:well-known|established|undeniable|indisputable) fact (?:that)?)\b/i
		]
	},
	{
		id: 'bandwagon',
		label: 'Bandwagon / Ad Populum',
		description: 'Claims something is true because many people believe it',
		explanation:
			'The bandwagon fallacy (argumentum ad populum) argues that something must be true or good because many people believe or do it. Popular opinion is not a reliable indicator of truth. Evaluate the evidence independently of how many people accept the conclusion.',
		category: 'fallacy',
		severity: 'info',
		icon: 'help-circle',
		patterns: [
			/\b(?:(?:most|many|millions of) people (?:agree|believe|think|know|support))\b/i,
			/\b(?:(?:the )?(?:majority|public|masses|population|world) (?:agrees?|believes?|supports?|thinks?|knows?))\b/i,
			/\b(?:(?:it'?s |this is )?(?:common (?:sense|knowledge)|widely (?:known|accepted|believed|recognized)))\b/i,
			/\b(?:jump on the bandwagon|get with the times|join the movement)\b/i,
			/\b(?:(?:are you|don'?t be) the (?:only|last) one)\b/i,
			/\b(?:polls? (?:show|indicate|prove|confirm))\b/i
		]
	},
	{
		id: 'appeal_to_nature',
		label: 'Appeal to Nature',
		description: 'Argues something is good because it is "natural"',
		explanation:
			'The appeal to nature fallacy assumes that what is "natural" is inherently good, healthy, or correct, and what is "unnatural" is bad. Natural and unnatural are often poorly defined, and many natural things are harmful while many beneficial things are synthetic.',
		category: 'fallacy',
		severity: 'info',
		icon: 'help-circle',
		patterns: [
			/\b(?:(?:it(?:'s| is)|that(?:'s| is)) (?:only |just )?(?:natural|nature'?s? (?:way|intention|design)))\b/i,
			/\b(?:(?:un)?natural (?:and )?(?:therefore|so|thus|hence) (?:good|bad|safe|unsafe|healthy|unhealthy|harmful|harmless))\b/i,
			/\b(?:nature (?:intended|designed|made|didn'?t intend))\b/i,
			/\b(?:(?:go|get|return) (?:back )?to (?:nature|natural|the way (?:it|things) (?:used to|should) be))\b/i,
			/\b(?:humans (?:were|are) (?:meant|designed|evolved|built|supposed) to)\b/i
		]
	},
	{
		id: 'tu_quoque',
		label: 'Tu Quoque / Whataboutism',
		description: 'Deflects criticism by pointing to someone else\'s behavior',
		explanation:
			'Tu quoque ("you too") or whataboutism deflects criticism by pointing out that the accuser or another party is guilty of the same or similar behavior. While hypocrisy is worth noting, it does not invalidate the original argument. Address the argument on its merits.',
		category: 'fallacy',
		severity: 'warning',
		icon: 'alert-triangle',
		patterns: [
			/\b(?:what about)\b/i,
			/\b(?:but (?:you|they) (?:also|too|did the same|do it too))\b/i,
			/\b(?:you(?:'re| are) (?:one|the one|not one) to talk)\b/i,
			/\b(?:look who(?:'s| is) talking)\b/i,
			/\b(?:(?:pot|kettle) call(?:ing|s)? the (?:kettle|pot))\b/i,
			/\b(?:but (?:what|how) about (?:when (?:you|they)))\b/i,
			/\b(?:that(?:'s| is) (?:rich|ironic|hypocritical) coming from)\b/i
		],
		nodeTypes: ['counter', 'rebuttal', 'claim']
	},
	{
		id: 'no_true_scotsman',
		label: 'No True Scotsman',
		description: 'Redefines a group to exclude counterexamples',
		explanation:
			'The No True Scotsman fallacy occurs when someone redefines the criteria for group membership to exclude counterexamples, rather than accepting that the generalization was wrong. "No real/true X would do Y" is the classic pattern.',
		category: 'fallacy',
		severity: 'warning',
		icon: 'alert-triangle',
		patterns: [
			/\b(?:no (?:true|real|actual|genuine|proper) (?:\w+ )?would)\b/i,
			/\b(?:(?:a|any) (?:true|real|actual|genuine|proper) (?:\w+ )?(?:would|wouldn'?t|should|shouldn'?t))\b/i,
			/\b(?:(?:they(?:'re| are)|that(?:'s| is)) not (?:a )?(?:real|true|actual|genuine|proper))\b/i,
			/\b(?:if (?:you|they) (?:were )?(?:really|truly|actually) (?:a )?)\b/i
		]
	},
	{
		id: 'red_herring',
		label: 'Possible Red Herring',
		description: 'May be introducing an irrelevant topic to divert attention',
		explanation:
			'A red herring introduces an irrelevant topic to divert attention from the original issue. While tangential points can provide context, they should not be used to avoid addressing the main argument. Check if this content directly relates to the central claim.',
		category: 'fallacy',
		severity: 'info',
		icon: 'help-circle',
		patterns: [
			/\b(?:(?:but |however,? )?the (?:real|bigger|more important|actual|main|underlying) (?:issue|problem|question|point|concern) (?:is|here is))\b/i,
			/\b(?:(?:let(?:'s| us)|we should|you should) (?:not )?(?:talk|think|focus|worry) about (?:the real|what really|something (?:more )?important))\b/i,
			/\b(?:(?:that(?:'s| is) )?(?:beside the point|not the point|irrelevant|a distraction|a diversion|not what we(?:'re| are) (?:talking|discussing)))\b/i
		],
		nodeTypes: ['counter', 'rebuttal']
	},
	{
		id: 'equivocation',
		label: 'Possible Equivocation',
		description: 'May be using a word with shifting meaning',
		explanation:
			'Equivocation occurs when a key word or phrase is used with different meanings at different points in an argument, making an invalid argument appear valid. Ensure that key terms are defined consistently throughout the argument.',
		category: 'fallacy',
		severity: 'info',
		icon: 'help-circle',
		patterns: [
			/\b(?:(?:in (?:a|one|the (?:other|second|different)) sense|depends (?:on )?what you mean by|it depends (?:on )?how you define))\b/i,
			/\b(?:"[\w\s]+" (?:can mean|means (?:different things|both|either)))\b/i
		],
		nodeTypes: ['warrant', 'claim'],
		minLength: 30
	},

	// ─────────────────────────────────────────
	// MANIPULATIVE / CULTISH LANGUAGE
	// ─────────────────────────────────────────
	{
		id: 'thought_terminating',
		label: 'Thought-Terminating Cliché',
		description: 'Uses a stock phrase designed to end critical thinking',
		explanation:
			'Thought-terminating clichés are commonly used phrases that discourage critical thinking and meaningful discussion. They act as conversation stoppers that prevent further analysis. Examples include "it is what it is," "everything happens for a reason," and "that\'s just the way it is." These phrases should be replaced with substantive reasoning.',
		category: 'cultish',
		severity: 'warning',
		icon: 'brain',
		patterns: [
			/\b(?:it is what it is)\b/i,
			/\b(?:everything happens for a reason)\b/i,
			/\b(?:(?:that(?:'s| is)|it(?:'s| is)) just (?:the|how) (?:way (?:it is|things are|the world works|life is)|how it goes|common sense))\b/i,
			/\b(?:you(?:'ll| will) understand (?:when|once|someday|later|in time))\b/i,
			/\b(?:(?:don'?t|stop|quit|you shouldn'?t) (?:over)?think(?:ing)? (?:about )?it)\b/i,
			/\b(?:it(?:'s| is) not (?:for (?:us|you|me) )?to question)\b/i,
			/\b(?:(?:ours|yours|theirs) (?:is )?not to (?:reason why|question))\b/i,
			/\b(?:the (?:science|debate|matter|discussion) is settled)\b/i,
			/\b(?:end of (?:story|discussion|debate|conversation))\b/i,
			/\b(?:case closed|nuff said|period|full stop)\b/i
		]
	},
	{
		id: 'us_vs_them',
		label: 'Us vs. Them',
		description: 'Creates an in-group/out-group division',
		explanation:
			'Us-vs-them language creates a sharp division between an in-group ("we," "our side," "real Americans") and a vilified out-group ("they," "those people," "the enemy"). This tribal framing discourages empathy and nuance. Evaluate whether the characterization of "the other side" is fair and accurate.',
		category: 'cultish',
		severity: 'warning',
		icon: 'shield-alert',
		patterns: [
			/\b(?:(?:real|true|patriotic|loyal|good) (?:americans?|citizens?|christians?|believers?|patriots?|people))\b/i,
			/\b(?:(?:the )?(?:enemy|enemies|opposition|them|outsiders|others) (?:want|are trying|seek|conspire|plot) to)\b/i,
			/\b(?:(?:we|our (?:people|side|group|movement|cause)) (?:vs?\.?|versus|against) (?:them|they|their|the (?:other|establishment|elites?|system)))\b/i,
			/\b(?:(?:if you(?:'re| are) not (?:with|for) us|you(?:'re| are) (?:either )?(?:with|for) us or (?:against|with) them))\b/i,
			/\b(?:wake up,? (?:people|sheeple|folks|america))\b/i,
			/\b(?:(?:the )?(?:elites?|globalists?|establishment|deep state|ruling class|powers that be) (?:don'?t )?want)\b/i
		]
	},
	{
		id: 'loaded_language',
		label: 'Loaded Language',
		description: 'Uses emotionally charged words to influence rather than inform',
		explanation:
			'Loaded language uses words with strong emotional connotations to influence the audience\'s perception without providing substantive evidence. Terms like "radical," "regime," "extremist," or "freedom fighter" carry implicit judgments. Consider whether neutral language would change the strength of the argument.',
		category: 'manipulative',
		severity: 'info',
		icon: 'eye',
		patterns: [
			/\b(?:regime|junta|dictatorship)(?! (?:was|is|has been) (?:widely|officially|internationally|formally) (?:recognized|designated|classified))\b/i,
			/\b(?:(?:radical|extreme|dangerous|militant|fanatical) (?:left|right|agenda|ideology|movement|group|faction))\b/i,
			/\b(?:(?:freedom fighter|patriot|hero|warrior|crusade|jihad|holy war|righteous))\b/i,
			/\b(?:(?:un-?american|anti-?american|traitor(?:ous)?|seditious|subversive|treasonous))\b/i,
			/\b(?:(?:sheeple|libtard|snowflake|woke mob|cancel culture mob|nazi|fascist|communist))\b/i,
			/\b(?:(?:destroy(?:ing)?|demolish(?:ing)?|annihilat(?:e|ing)|eradicat(?:e|ing)|eliminat(?:e|ing)) (?:our|the|their) (?:way of life|values|freedom|culture|heritage|traditions?))\b/i
		]
	},
	{
		id: 'black_white_morality',
		label: 'Absolute Morality',
		description: 'Frames the issue in absolute moral terms with no nuance',
		explanation:
			'Framing complex issues in terms of absolute good vs. evil leaves no room for nuance, compromise, or understanding of opposing perspectives. Most real-world issues involve trade-offs and competing values. Consider whether the moral framing is proportionate to the actual stakes.',
		category: 'manipulative',
		severity: 'warning',
		icon: 'shield-alert',
		patterns: [
			/\b(?:(?:pure|absolute|total|complete|utter) (?:evil|good|truth|lies?))\b/i,
			/\b(?:(?:the )?(?:forces? of )?(?:good|light|truth|righteousness) (?:vs?\.?|versus|against|battling) (?:the )?(?:forces? of )?(?:evil|darkness|lies?|wickedness))\b/i,
			/\b(?:morally (?:bankrupt|reprehensible|indefensible|unconscionable|corrupt))\b/i,
			/\b(?:(?:this is|it(?:'s| is)) (?:a )?(?:fight|battle|war|struggle) (?:between|for|of) (?:good and evil|right and wrong|truth and lies))\b/i,
			/\b(?:(?:on the )?(?:right|wrong) side of history)\b/i,
			/\b(?:(?:no |there(?:'s| is) no )?moral(?:ly)? (?:equivalent|equivalence|ambiguity|gray (?:area|zone)))\b/i
		]
	},
	{
		id: 'fear_mongering',
		label: 'Fear Mongering',
		description: 'Uses fear and urgency to bypass rational evaluation',
		explanation:
			'Fear mongering uses exaggerated threats, worst-case scenarios, or manufactured urgency to prevent the audience from thinking critically. While genuine dangers should be communicated clearly, fear-based rhetoric often distorts the actual level of risk. Evaluate the evidence for the claimed threat level.',
		category: 'manipulative',
		severity: 'warning',
		icon: 'shield-alert',
		patterns: [
			/\b(?:(?:existential|imminent|immediate|dire|grave|mortal|deadly|catastrophic) (?:threat|danger|risk|crisis|emergency|peril))\b/i,
			/\b(?:(?:we(?:'re| are)|you(?:'re| are)|they(?:'re| are)|it(?:'s| is)) (?:running out of time|too late|at a (?:tipping|breaking) point))\b/i,
			/\b(?:(?:act|do something|decide|choose) (?:now|immediately|before it(?:'s| is) too late|while (?:you|we) still can))\b/i,
			/\b(?:(?:the )?end (?:of|is) (?:near|coming|approaching|imminent))\b/i,
			/\b(?:(?:if we don'?t act|unless we act) (?:now|immediately|soon)[\s\S]{0,30}(?:will|shall|going to) (?:be destroyed|collapse|end|die|perish|cease to exist))\b/i,
			/\b(?:(?:point of no return|last chance|now or never|do or die))\b/i
		]
	},
	{
		id: 'gaslighting',
		label: 'Gaslighting Language',
		description: 'Attempts to make others doubt their own perception',
		explanation:
			'Gaslighting language attempts to make others doubt their own memory, perception, or sanity. Phrases like "that never happened," "you\'re imagining things," or "you\'re being too sensitive" are designed to undermine the target\'s confidence in their own experience. This is a manipulation tactic, not a form of argument.',
		category: 'manipulative',
		severity: 'error',
		icon: 'shield-alert',
		patterns: [
			/\b(?:(?:that )?(?:never happened|didn'?t happen|isn'?t (?:true|real|happening)))\b/i,
			/\b(?:you(?:'re| are) (?:(?:being )?(?:too |over(?:ly )?)?(?:sensitive|dramatic|emotional|paranoid|crazy|irrational|hysterical|delusional)))\b/i,
			/\b(?:you(?:'re| are) (?:imagining|making (?:it|things|this) up|seeing things|hearing things|remembering (?:it )?wrong))\b/i,
			/\b(?:(?:no one|nobody) (?:else )?(?:thinks|believes|feels|sees|agrees with) that)\b/i,
			/\b(?:(?:you|they) (?:always )?(?:twist|distort|misremember|misunderstand) (?:everything|things|what (?:I|we) (?:said|meant|did)))\b/i
		],
		nodeTypes: ['claim', 'counter', 'rebuttal']
	},
	{
		id: 'social_proof_pressure',
		label: 'Social Pressure',
		description: 'Uses peer pressure or social conformity to coerce agreement',
		explanation:
			'Social proof pressure leverages the human desire to conform by implying that disagreement means being isolated, abnormal, or left behind. This is a manipulation tactic that substitutes social pressure for evidence. An argument should stand on its own merits regardless of how many people agree with it.',
		category: 'cultish',
		severity: 'warning',
		icon: 'brain',
		patterns: [
			/\b(?:(?:everyone|everybody|all (?:reasonable|smart|informed|educated|intelligent) people) (?:already )?(?:knows?|agrees?|understands?|can see|accepts?))\b/i,
			/\b(?:(?:only (?:a )?(?:fool|idiot|moron|ignorant person|contrarian|denier) would))\b/i,
			/\b(?:(?:you (?:don'?t|wouldn'?t) want to be (?:the (?:only|last) one|left (?:behind|out)|on the wrong side)))\b/i,
			/\b(?:(?:get )?(?:on board|with the program|on the right side) (?:or|before))\b/i,
			/\b(?:(?:the )?(?:consensus|scientific consensus|expert consensus|overwhelming (?:majority|consensus)) (?:says?|agrees?|confirms?|is (?:clear|settled|unanimous)))\b/i
		]
	},
	{
		id: 'sacred_science',
		label: 'Sacred Science / Unfalsifiable',
		description: 'Presents claims as beyond question or criticism',
		explanation:
			'Sacred science makes claims that are presented as absolute truths beyond any questioning, testing, or criticism. In healthy discourse, all claims should be open to scrutiny and potential falsification. When a claim cannot even theoretically be proven wrong, it is unfalsifiable and not a productive basis for argument.',
		category: 'cultish',
		severity: 'error',
		icon: 'brain',
		patterns: [
			/\b(?:(?:cannot|can'?t|must not|should not|shouldn'?t) (?:be )?question(?:ed)?)\b/i,
			/\b(?:(?:beyond|above|immune to) (?:question|criticism|doubt|scrutiny|reproach|challenge|debate))\b/i,
			/\b(?:(?:absolute|eternal|universal|divine|sacred|unquestionable|indisputable|irrefutable|incontrovertible|self-evident) truth)\b/i,
			/\b(?:(?:only|the one) (?:true|correct|right|valid|legitimate|proper|real) (?:way|path|answer|solution|interpretation|understanding|view|perspective))\b/i,
			/\b(?:(?:if you|anyone who) (?:question|doubt|challenge|criticize|disagree)s?[\s\S]{0,20}(?:doesn'?t|don'?t|can'?t) (?:understand|see|get it|grasp))\b/i,
			/\b(?:heresy|blasphemy|sacrilege|apostate|infidel|heretic)\b/i
		]
	},
	{
		id: 'milieu_control',
		label: 'Information Control',
		description: 'Discourages engagement with outside sources or perspectives',
		explanation:
			'Information control (or milieu control) involves discouraging or prohibiting engagement with outside sources of information. Phrases like "don\'t listen to the mainstream media," "they\'re lying to you," or "only trust X source" are designed to create an information bubble. A strong argument can withstand exposure to opposing viewpoints.',
		category: 'cultish',
		severity: 'error',
		icon: 'brain',
		patterns: [
			/\b(?:(?:don'?t|never|stop) (?:trust|believe|listen to|read|watch|follow) (?:the )?(?:mainstream|corporate|liberal|conservative|legacy|fake) (?:media|news|press|outlets?|sources?))\b/i,
			/\b(?:(?:they(?:'re| are)|the media (?:is|are)|(?:mainstream |corporate )?media (?:is|are)) (?:lying|hiding|covering up|suppressing|censoring|not telling you))\b/i,
			/\b(?:(?:do )?(?:your )?own research)\b/i,
			/\b(?:(?:you (?:can |should )?only (?:trust|believe|rely on)) (?:us|this|our|these?))\b/i,
			/\b(?:(?:the )?truth (?:they|the (?:government|media|establishment)) (?:don'?t|doesn'?t|won'?t) want you to (?:know|see|hear|find out))\b/i,
			/\b(?:banned|censored|suppressed|silenced) (?:by|from|because)\b/i
		]
	},

	// ─────────────────────────────────────────
	// WEAK REASONING PATTERNS
	// ─────────────────────────────────────────
	{
		id: 'weasel_words',
		label: 'Weasel Words',
		description: 'Uses vague qualifiers that sound authoritative but lack substance',
		explanation:
			'Weasel words are vague qualifiers that create the impression of a specific, meaningful statement without actually making one. Phrases like "some say," "it is believed," "studies show," or "many people think" attribute claims to unnamed sources. Identify who specifically says, believes, or has shown the thing being claimed.',
		category: 'weak',
		severity: 'info',
		icon: 'help-circle',
		patterns: [
			/\b(?:(?:some|many|a lot of|numerous|various|certain|several|countless) (?:people|experts?|scientists?|researchers?|studies|sources?|critics?|observers?) (?:say|believe|think|argue|suggest|claim|maintain|contend|assert|feel))\b/i,
			/\b(?:it (?:is|has been) (?:widely |often |frequently |commonly |generally )?(?:said|believed|thought|claimed|argued|suggested|reported|noted|observed|known|acknowledged|recognized|understood))\b/i,
			/\b(?:(?:studies|research|evidence|data|reports?) (?:show|suggest|indicate|reveal|demonstrate|confirm|prove) that)\b(?!.*(?:(?:19|20)\d{2}|doi:|http|journal|university|published))/i,
			/\b(?:arguably|supposedly|seemingly|apparently|ostensibly|presumably|purportedly|allegedly)\b/i,
			/\b(?:questions? (?:have been |are being )?raised (?:about|over|regarding|concerning))\b/i
		]
	},
	{
		id: 'hedge_overuse',
		label: 'Excessive Hedging',
		description: 'So heavily qualified that the claim makes no clear assertion',
		explanation:
			'While qualifiers like "might," "could," "possibly," and "in some cases" are appropriate for uncertain claims, excessive hedging can make a statement so vague that it is essentially unfalsifiable. If every word is hedged, the claim may not actually be saying anything. Consider whether a more direct assertion is warranted by the evidence.',
		category: 'weak',
		severity: 'info',
		icon: 'help-circle',
		patterns: [
			// This one uses a scoring approach — triggered by multiple hedges in short text
			/(?:(?:might|could|may|perhaps|possibly|potentially|conceivably|arguably|seemingly|to some (?:extent|degree))[\s\S]{0,40}){3,}/i
		],
		minLength: 30
	},
	{
		id: 'anecdotal',
		label: 'Anecdotal Evidence',
		description: 'Uses personal stories as if they were representative data',
		explanation:
			'Anecdotal evidence uses personal experience or isolated examples as if they represent a broader trend. While personal stories can illustrate a point, they should not be the primary basis for a general claim. Individual experiences are subject to bias, selective memory, and may not be representative. Look for systematic data or broader evidence.',
		category: 'weak',
		severity: 'info',
		icon: 'help-circle',
		patterns: [
			/\b(?:(?:I |we )?personally (?:know|saw|experienced|witnessed|met|encountered|heard))\b/i,
			/\b(?:(?:my|a) (?:friend|neighbor|colleague|relative|uncle|aunt|cousin|brother|sister|father|mother|coworker|boss) (?:who |that |once |always )?(?:told me|said|had|was|experienced|got|went))\b/i,
			/\b(?:I(?:'ve| have) (?:seen|known|heard|met|talked to) (?:plenty|lots|many|enough|several) (?:of|who))\b/i,
			/\b(?:(?:in my|from my) (?:experience|observation|view|opinion)(?:,)? (?:all|most|many|every|no|none))\b/i
		],
		nodeTypes: ['evidence', 'claim', 'warrant']
	}
];

// ============================================
// Analysis Engine
// ============================================

/**
 * Analyze a node's content for rhetorical issues.
 * Returns an array of alerts sorted by severity (error > warning > info).
 */
export function analyzeNodeContent(
	content: string,
	nodeType: ArgumentNodeType
): RhetoricalAlert[] {
	if (!content || content.length < 8) return [];

	const alerts: RhetoricalAlert[] = [];
	const seen = new Set<string>();

	for (const rule of PATTERN_RULES) {
		// Skip if already found this rule
		if (seen.has(rule.id)) continue;

		// Skip if rule is for specific node types and this isn't one of them
		if (rule.nodeTypes && !rule.nodeTypes.includes(nodeType)) continue;

		// Skip if content is too short for this rule
		if (rule.minLength && content.length < rule.minLength) continue;

		// Check each pattern
		for (const pattern of rule.patterns) {
			const match = content.match(pattern);
			if (match) {
				seen.add(rule.id);
				alerts.push({
					id: rule.id,
					label: rule.label,
					description: rule.description,
					explanation: rule.explanation,
					category: rule.category,
					severity: rule.severity,
					icon: rule.icon,
					matchedText: match[0]
				});
				break; // One match per rule is enough
			}
		}
	}

	// Sort by severity: error > warning > info
	const severityOrder: Record<AlertSeverity, number> = {
		error: 0,
		warning: 1,
		info: 2
	};

	alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

	return alerts;
}

/**
 * Get a summary count of alerts by category.
 */
export function getAlertSummary(alerts: RhetoricalAlert[]): Record<AlertCategory, number> {
	const summary: Record<AlertCategory, number> = {
		fallacy: 0,
		manipulative: 0,
		cultish: 0,
		weak: 0
	};

	for (const alert of alerts) {
		summary[alert.category]++;
	}

	return summary;
}

/**
 * Get the highest severity from a list of alerts.
 */
export function getMaxSeverity(alerts: RhetoricalAlert[]): AlertSeverity | null {
	if (alerts.length === 0) return null;
	if (alerts.some((a) => a.severity === 'error')) return 'error';
	if (alerts.some((a) => a.severity === 'warning')) return 'warning';
	return 'info';
}

/**
 * Get a color for a given category.
 */
export function getCategoryColor(category: AlertCategory): string {
	switch (category) {
		case 'fallacy':
			return '#e8a84b';
		case 'manipulative':
			return '#e84b4b';
		case 'cultish':
			return '#b44be8';
		case 'weak':
			return '#78909c';
	}
}

/**
 * Get a label for a given category.
 */
export function getCategoryLabel(category: AlertCategory): string {
	switch (category) {
		case 'fallacy':
			return 'Logical Fallacy';
		case 'manipulative':
			return 'Manipulative Language';
		case 'cultish':
			return 'Cultish Language';
		case 'weak':
			return 'Weak Reasoning';
	}
}

/**
 * Get an icon hint for a severity level.
 */
export function getSeverityColor(severity: AlertSeverity): string {
	switch (severity) {
		case 'error':
			return '#e84b4b';
		case 'warning':
			return '#e8a84b';
		case 'info':
			return '#78909c';
	}
}
