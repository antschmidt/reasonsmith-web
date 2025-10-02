// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageState {}
		// interface Platform {}
	}
}

// Can give me a prompt which will perform these analyses for good faith, logical fallacies, and cultish language and return a json object like the following:
// {
//   "good_faith": [
// 	{"name": "Charity", "description": "Interpreting others' arguments in the strongest possible way.", "example": "Person A: We should have stricter gun control laws. Person B: Person A is concerned about public safety and wants to reduce gun violence.", "why": "Person B interprets Person A's argument in a way that makes it stronger and more reasonable."}
//   ],
//   "logical_fallacies": [
//     {"name": "Strawman", "description": "Misrepresenting someone's argument to make it easier to attack.", "example": "Person A: We should have stricter gun control laws. Person B: Person A wants to take away all our guns!", "why": "Person B misrepresents Person A's position to make it easier to attack."},
//     {"name": "Ad Hominem", "description": "Attacking the person instead of the argument."}
//   ],
//   "cultish_language": [
// 	{"name": "Us vs. Them", "description": "Creating a division between 'us' (the in-group) and 'them' (the out-group).", "example": "'Only true believers understand the real truth, while outsiders are blind to it.'", "why": "This language creates a sense of superiority among the in-group and alienates outsiders."}
//   ],
//   fact_checking: [
// 	{"claim": "The earth is flat.", "verdict": "False", "source": {"name": "NASA and scientific consensus.", "url": "https://www.nasa.gov/"}}
//   ]
// }

export {};
