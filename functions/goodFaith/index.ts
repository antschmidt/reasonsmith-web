/// <reference lib="es2020" />
// Serverless function to score a post for good-faith argumentation using OpenAI
// expected request body: { postId: string, content: string }

import OpenAI from "openai";

interface Claim {
  claim: string;
  arguments: Array<{
    text: string;
    score: number; // 1-10
    fallacies: string[];
    manipulativeLanguage: string[];
    suggestions: string[];
  }>;
}

interface ScoreResponse {
  claims: Claim[];
  fallacyOverload: boolean;
  goodFaithScore: number; // 0-100
  cultishPhrases: string[];
  summary: string;
  
  // Legacy fields for backward compatibility
  good_faith_score?: number;
  good_faith_label?: string;
  rationale?: string;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define the JSON schema for structured output
const goodFaithSchema = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: {
            type: "string",
            description: "The main claim or assertion being made"
          },
          arguments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: {
                  type: "string",
                  description: "The supporting argument text or quote"
                },
                score: {
                  type: "number",
                  minimum: 1,
                  maximum: 10,
                  description: "Quality score of the argument (1-10)"
                },
                fallacies: {
                  type: "array",
                  items: {
                    type: "string"
                  },
                  description: "List of logical fallacies found in this argument"
                },
                manipulativeLanguage: {
                  type: "array",
                  items: {
                    type: "string"
                  },
                  description: "Specific manipulative phrases or language patterns found"
                },
                suggestions: {
                  type: "array",
                  items: {
                    type: "string"
                  },
                  description: "Suggestions for improving this argument"
                }
              },
              required: ["text", "score", "fallacies", "manipulativeLanguage", "suggestions"],
              additionalProperties: false
            }
          }
        },
        required: ["claim", "arguments"],
        additionalProperties: false
      }
    },
    fallacyOverload: {
      type: "boolean",
      description: "True if most arguments are fallacy-laden"
    },
    goodFaithScore: {
      type: "number",
      minimum: 0,
      maximum: 100,
      description: "Overall good faith score (0-100) based on percentage of claims made in good faith"
    },
    cultishPhrases: {
      type: "array",
      items: {
        type: "string"
      },
      description: "List of cultish or manipulative phrases found throughout the text"
    },
    summary: {
      type: "string",
      description: "Comprehensive textual summary of the analysis including patterns found and recommendations"
    }
  },
  required: ["claims", "fallacyOverload", "goodFaithScore", "cultishPhrases", "summary"],
  additionalProperties: false
};

async function scoreWithOpenAI(content: string): Promise<ScoreResponse> {
  try {
    // Check if using custom prompt or fallback to chat completion
    if (process.env.OPENAI_PROMPT_ID) {
      const response = await openai.responses.create({
        prompt: {
          "id": process.env.OPENAI_PROMPT_ID,
          "version": "1"
        },
        variables: {
          content: content
        }
      });
      
      // Parse the response based on your prompt structure
      const result = response.content;
      // You'll need to adjust this parsing based on your prompt's expected output format
      return parseOpenAIResponse(result);
    } else {
      // Use structured outputs with chat completion API
      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert in logic, rhetoric, and argumentation. Analyze the given text with rigorous academic precision.

**CRITICAL REQUIREMENTS:**
1. **Extract specific claims** - Each distinct assertion or position stated in the text
2. **Identify supporting arguments** - Direct quotes or reasoning used to support each claim
3. **List specific fallacies by name** - Use precise logical fallacy terminology
4. **Extract manipulative language** - Quote specific phrases that use emotional manipulation
5. **Provide detailed suggestions** - Concrete, actionable improvements for each argument

**Analysis Format:**

For each claim, find its supporting arguments and analyze them with this structure:
- **text**: The exact quote or paraphrase of the supporting argument
- **score**: 1-10 quality rating (1=fallacious/manipulative, 10=excellent logic/evidence)
- **fallacies**: Array of specific fallacy names (e.g., "Ad Hominem", "Straw Man", "False Dichotomy", "Appeal to Fear", "Hasty Generalization", "Cherry-Picking", "Appeal to Authority", "Red Herring")
- **manipulativeLanguage**: Array of specific quoted phrases that use emotional manipulation, loaded language, or tribal signaling
- **suggestions**: Array of specific, actionable improvements

**Manipulative Language Patterns to Identify:**
- **Emotional appeals**: Fear-mongering phrases, rage-inducing terms
- **Tribal signaling**: "Real Americans", "liberal media", "they want to destroy us"
- **Loaded language**: Words chosen for emotional impact rather than accuracy
- **Absolute statements**: "always", "never", "all", "completely", "totally"
- **Dehumanizing terms**: Language that reduces people to objects or stereotypes
- **Thought-terminating clichés**: "Common sense", "everyone knows", "obvious to anyone"

**Example Analysis:**

Text: "The liberal media is destroying our country with their constant lies and fake news. Everyone knows they hate America."

{
  "claims": [
    {
      "claim": "The liberal media is destroying our country",
      "arguments": [
        {
          "text": "with their constant lies and fake news",
          "score": 2,
          "fallacies": ["Hasty Generalization", "Ad Hominem", "Loaded Language"],
          "manipulativeLanguage": ["liberal media", "destroying our country", "constant lies", "fake news"],
          "suggestions": ["Cite specific examples with sources", "Avoid broad generalizations about entire media organizations", "Use neutral language to describe news outlets"]
        },
        {
          "text": "Everyone knows they hate America",
          "score": 1,
          "fallacies": ["Appeal to Common Belief", "Mind Reading", "Poisoning the Well"],
          "manipulativeLanguage": ["Everyone knows", "they hate America"],
          "suggestions": ["Provide evidence for claims about motivations", "Avoid absolute statements like 'everyone knows'", "Focus on specific policies rather than attributing emotions"]
        }
      ]
    }
  ]
}

**Critical: Always provide this level of detail for EVERY argument in the text. Extract specific quotes and name precise fallacies.**`
          },
          {
            role: "user",
            content: content
          }
        ],
        temperature: 1,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "good_faith_analysis",
            schema: goodFaithSchema,
            strict: true
          }
        }
      });

      const responseText = response.choices[0]?.message?.content;
      if (!responseText) {
        throw new Error('No response from OpenAI');
      }

      // With structured outputs, we can safely parse the JSON
      const result = JSON.parse(responseText);
      
      // Add backward compatibility fields
      result.good_faith_score = result.goodFaithScore / 100; // Convert 0-100 to 0-1
      result.good_faith_label = getLabel(result.good_faith_score); // Use 0-1 scale
      result.rationale = result.summary;
      
      return result;
    }
  } catch (error: any) {
    console.error('OpenAI API error:', error);
    // Fallback to heuristic scoring if OpenAI fails
    return heuristicScore(content);
  }
}

function parseOpenAIResponse(content: string): ScoreResponse {
  // This function needs to be implemented based on your custom prompt's output format
  // For now, try to parse as JSON or fallback to heuristic
  try {
    return JSON.parse(content);
  } catch {
    return heuristicScore(content);
  }
}

function getLabel(score: number): string {
  if (score >= 0.8) return 'exemplary';
  if (score >= 0.6) return 'constructive';
  if (score >= 0.4) return 'neutral';
  if (score >= 0.2) return 'questionable';
  return 'hostile';
}

function heuristicScore(content: string): ScoreResponse {
  const lower = content.toLowerCase();
  let score = 50; // 0-100 scale
  
  // Basic heuristic analysis
  if (/(thank|appreciate)/.test(lower)) score += 10;
  if (/(evidence|source|reference)/.test(lower)) score += 15;
  if (/(idiot|stupid|hate|moron|trash)/.test(lower)) score -= 30;
  if (/(I understand|I see your point|you might be right)/.test(lower)) score += 10;
  if (/(always|never|all|none|everyone|no one)/.test(lower)) score -= 5; // Absolute statements
  
  score = Math.max(0, Math.min(100, score));
  
  // Create basic structured response
  const claims: Claim[] = [{
    claim: content.length > 100 ? content.substring(0, 100) + '...' : content,
    arguments: [{
      text: 'Heuristic analysis of overall content',
      score: Math.round(score / 10), // Convert to 1-10 scale
      fallacies: score < 40 ? ['Potential logical issues detected'] : [],
      manipulativeLanguage: [],
      suggestions: score < 60 ? ['Consider providing more evidence', 'Use more respectful language'] : ['Content appears reasonable']
    }]
  }];

  return {
    claims,
    fallacyOverload: score < 30,
    goodFaithScore: score,
    cultishPhrases: [],
    summary: 'Heuristic fallback analysis. OpenAI analysis unavailable.',
    good_faith_score: score / 100,
    good_faith_label: getLabel(score / 100),
    rationale: 'Heuristic fallback score.'
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const { postId, content } = body as { postId?: string; content?: string };
    if (typeof content !== 'string' || !content.trim()) {
      return new Response(JSON.stringify({ error: 'content required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    
    // Use OpenAI scoring instead of heuristic
    const scored = await scoreWithOpenAI(content);
    return new Response(JSON.stringify({ ...scored, postId: postId || null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
