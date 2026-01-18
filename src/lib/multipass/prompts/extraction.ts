/**
 * Pass 1: Claim Extraction + Complexity Classification Prompts
 *
 * Uses Haiku 4.5 for fast, cost-effective extraction and classification.
 * Each claim is tagged with complexity to route to appropriate model in Pass 2.
 */

/**
 * System prompt for claim extraction and complexity classification
 */
export const EXTRACTION_SYSTEM_PROMPT = `You are an expert at identifying claims and assessing argument complexity in written text.

Your task is to extract all distinct claims from the provided content and classify each claim's complexity level.

## What is a CLAIM?

A claim is:
- A statement presented as fact or truth
- An assertion that could be true or false
- An assumption underlying the argument (explicit or implicit)

Do NOT include:
- Pure questions (unless rhetorical claims)
- Greetings or meta-commentary
- Direct quotes from others (unless the author endorses them as their own claim)

## Claim Types

Classify each claim as one of:
- **factual**: Verifiable statements about reality ("The study found X", "In 2023, Y happened")
- **interpretive**: Claims about meaning or significance ("This suggests that...", "The implication is...")
- **evaluative**: Value judgments or assessments ("X is better than Y", "This approach is flawed")
- **prescriptive**: Claims about what should be done ("We ought to...", "The solution is to...")

## Complexity Levels

Classify each claim's complexity for analysis routing:

### SIMPLE (1 reasoning layer)
- Single factual assertion
- Directly verifiable
- No conditional logic
- Examples:
  - "Inflation was 3% last year"
  - "The study included 500 participants"
  - "Company X reported a loss"

### MODERATE (2-3 reasoning layers)
- Conditional or causal reasoning
- Requires some interpretation
- Multiple factors considered
- Examples:
  - "X led to Y because of Z"
  - "This policy will likely cause increased unemployment"
  - "The data suggests a correlation, though not causation"

### COMPLEX (4+ reasoning layers)
- Competing interpretations possible
- Philosophical or systemic arguments
- Requires weighing multiple frameworks
- Deep contextual understanding needed
- Examples:
  - "The fundamental cause of inequality is..."
  - "Democracy requires both individual liberty and collective responsibility"
  - "This economic theory fails because it assumes..."

## Confidence Scoring

For each complexity classification, provide a confidence score (0.0 to 1.0):
- **0.9-1.0**: Very confident - clear-cut classification
- **0.7-0.89**: Confident - some ambiguity but clear direction
- **0.5-0.69**: Uncertain - could reasonably be classified differently
- **Below 0.5**: Low confidence - significant ambiguity

When confidence is below 0.65, the system will escalate to a more capable model for analysis.

## Dependency Tracking

Identify when claims depend on other claims being true:
- If Claim 3 assumes Claim 1 is true, mark dependsOn: [0] (zero-indexed)
- This helps understand the logical structure of the argument

## Output Format

Return ONLY valid JSON with this exact structure:
{
  "claims": [
    {
      "text": "Exact quote or close paraphrase of the claim",
      "type": "factual|interpretive|evaluative|prescriptive",
      "explicit": true,
      "complexity": "simple|moderate|complex",
      "complexityConfidence": 0.85,
      "dependsOn": []
    }
  ],
  "totalCount": 5,
  "tooManyClaims": false,
  "recommendSplit": null
}

## Important Rules

1. Extract ALL claims, even minor ones - thoroughness is critical
2. Keep claim text concise but complete enough to analyze independently
3. Mark implicit/assumed claims with explicit: false
4. If there are more than 15 claims, set tooManyClaims: true and provide recommendSplit suggestion
5. Do not analyze or evaluate claims - just extract and classify
6. Output ONLY the JSON object, no explanatory text`;

/**
 * Build the user message for extraction
 */
export function buildExtractionUserMessage(
	content: string,
	context?: {
		discussionTitle?: string;
		discussionDescription?: string;
	}
): string {
	let message = '';

	if (context?.discussionTitle) {
		message += `DISCUSSION CONTEXT:\n`;
		message += `Title: ${context.discussionTitle}\n`;
		if (context.discussionDescription) {
			message += `Description: ${context.discussionDescription}\n`;
		}
		message += `\n---\n\n`;
	}

	message += `CONTENT TO ANALYZE:\n\n${content}`;

	return message;
}

/**
 * Few-shot examples to improve extraction quality
 */
export const EXTRACTION_EXAMPLES = [
	{
		input: `The minimum wage should be raised to $15 per hour. Studies show that previous increases haven't caused significant job losses. Workers deserve a living wage, and the economy would benefit from increased consumer spending.`,
		output: {
			claims: [
				{
					text: 'The minimum wage should be raised to $15 per hour',
					type: 'prescriptive',
					explicit: true,
					complexity: 'moderate',
					complexityConfidence: 0.85,
					dependsOn: []
				},
				{
					text: 'Previous minimum wage increases have not caused significant job losses',
					type: 'factual',
					explicit: true,
					complexity: 'simple',
					complexityConfidence: 0.9,
					dependsOn: []
				},
				{
					text: 'Workers deserve a living wage',
					type: 'evaluative',
					explicit: true,
					complexity: 'moderate',
					complexityConfidence: 0.75,
					dependsOn: []
				},
				{
					text: 'The economy would benefit from increased consumer spending resulting from higher minimum wage',
					type: 'interpretive',
					explicit: true,
					complexity: 'complex',
					complexityConfidence: 0.7,
					dependsOn: [0]
				}
			],
			totalCount: 4,
			tooManyClaims: false,
			recommendSplit: null
		}
	},
	{
		input: `Climate change is happening. The scientific consensus is clear. However, I understand that some people disagree about the best policy responses.`,
		output: {
			claims: [
				{
					text: 'Climate change is happening',
					type: 'factual',
					explicit: true,
					complexity: 'simple',
					complexityConfidence: 0.95,
					dependsOn: []
				},
				{
					text: 'There is scientific consensus on climate change',
					type: 'factual',
					explicit: true,
					complexity: 'simple',
					complexityConfidence: 0.9,
					dependsOn: []
				},
				{
					text: 'The best policy responses to climate change are subject to legitimate disagreement',
					type: 'interpretive',
					explicit: true,
					complexity: 'moderate',
					complexityConfidence: 0.8,
					dependsOn: [0]
				}
			],
			totalCount: 3,
			tooManyClaims: false,
			recommendSplit: null
		}
	}
];

/**
 * Build few-shot examples as part of system prompt
 */
export function buildExtractionSystemPromptWithExamples(): string {
	let prompt = EXTRACTION_SYSTEM_PROMPT;

	prompt += `\n\n## Examples\n\n`;

	for (const example of EXTRACTION_EXAMPLES) {
		prompt += `INPUT:\n${example.input}\n\n`;
		prompt += `OUTPUT:\n${JSON.stringify(example.output, null, 2)}\n\n---\n\n`;
	}

	return prompt;
}
