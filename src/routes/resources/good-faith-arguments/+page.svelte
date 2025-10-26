<svelte:options runes={true} />

<script lang="ts">
	import { X, Info } from '@lucide/svelte';

	type Explanation = {
		term: string;
		eli12: string;
		examples: string[];
	};

	let showModal = $state(false);
	let selectedExplanation = $state<Explanation | null>(null);

	const fallacyExplanations: Record<string, Explanation> = {
		'straw-man': {
			term: 'Straw Man',
			eli12:
				"Imagine you're arguing about whether dogs are better than cats. Instead of talking about what you actually said, someone pretends you said 'all cats are evil' and argues against that instead. They're making up a weaker, easier-to-defeat version of your argument—like a scarecrow made of straw instead of a real person.",
			examples: [
				"You: 'We should limit screen time for kids.'\nThem: 'So you want kids to never use technology? That's ridiculous!'",
				"You: 'I think we need better bike lanes.'\nThem: 'Oh, so you hate cars and want to ban all vehicles?'"
			]
		},
		'ad-hominem': {
			term: 'Ad Hominem',
			eli12:
				"This is when someone attacks you personally instead of explaining why your idea is wrong. It's like if you said 'I think we should have pizza for lunch' and they replied 'Well, you're just a messy eater!' That doesn't prove pizza is bad—it's just mean.",
			examples: [
				"You: 'Climate change is real and serious.'\nThem: 'You're just a tree-hugging hippie, why should we listen to you?'",
				"You: 'This policy might help schools.'\nThem: 'You dropped out of college, so your opinion doesn't matter.'"
			]
		},
		'motte-and-bailey': {
			term: 'Motte-and-Bailey',
			eli12:
				"Imagine a castle with a fancy tower (bailey) and a super strong fortress (motte). Someone makes a bold, controversial claim (the fancy tower), but when challenged, they retreat to a safe, obvious claim (the fortress) and pretend that's what they meant all along. Then they sneak back to the bold claim later.",
			examples: [
				"Bold claim: 'All police are corrupt.'\nWhen challenged: 'I just meant some police make mistakes.'\nLater: Goes back to claiming all police are corrupt.",
				"Bold claim: 'Video games cause violence.'\nWhen challenged: 'I only meant too much screen time can be unhealthy.'\nLater: Back to blaming video games for violence."
			]
		},
		'false-dichotomy': {
			term: 'False Dichotomy',
			eli12:
				"This is when someone pretends there are only two choices when there are actually more options. It's like saying 'Either you eat vegetables every meal or you'll be totally unhealthy'—but there are lots of ways to be healthy between those two extremes!",
			examples: [
				"'Either you support our war efforts 100%, or you hate our country.'",
				"'You're either with us, or you're against us.'",
				"'Either we ban all cars, or we do nothing about pollution.'"
			]
		},
		'moving-goalposts': {
			term: 'Moving the Goalposts',
			eli12:
				"Imagine playing soccer, and every time you're about to score, the other team moves the goal further away. In arguments, this is when someone keeps changing what evidence they need to be convinced. No matter what proof you show them, they say 'Well, now I need something else too!'",
			examples: [
				"Them: 'Show me one study.'\nYou: *shows study*\nThem: 'Okay, now show me five studies from different countries.'",
				"Them: 'Prove it works.'\nYou: *proves it works*\nThem: 'But can you prove it works for everyone in every situation?'"
			]
		},
		whataboutism: {
			term: 'Whataboutism',
			eli12:
				"This is like when you tell your sibling to clean their room, and they say 'Well what about YOUR messy room?!' instead of talking about their room. They're changing the subject to avoid the original point. It doesn't solve anything—now both rooms are still messy!",
			examples: [
				"You: 'This company pollutes too much.'\nThem: 'What about China? They pollute more!'",
				"You: 'This politician lied.'\nThem: 'What about that other politician who also lied?'"
			]
		},
		'appeal-to-authority': {
			term: 'Appeal to (Unqualified) Authority',
			eli12:
				"Just because someone is an expert in one thing doesn't mean they're right about everything. It's like asking your gym teacher about math homework—they might be amazing at sports, but that doesn't make them a math expert. Listen to experts in the right field!",
			examples: [
				"'My dentist says climate change isn't real.' (Dentists study teeth, not climate)",
				"'This famous actor says this diet cures cancer.' (Actors aren't medical researchers)"
			]
		},
		'cherry-picking': {
			term: 'Cherry Picking',
			eli12:
				"Imagine you took 100 math tests and failed 95 of them, but you only show your parents the 5 you passed. That's cherry-picking! You're only showing the evidence that supports your point while hiding everything that doesn't. It's not the full truth.",
			examples: [
				"'This one study says sugar is fine!' (ignoring 50 studies showing sugar health risks)",
				"'It snowed today, so global warming is fake!' (ignoring decades of temperature data)"
			]
		},
		'slippery-slope': {
			term: 'Slippery Slope',
			eli12:
				"This is when someone says if we do one small thing, it'll definitely lead to extreme terrible things—but they don't explain HOW or WHY. It's like saying 'If you eat one cookie, you'll eat the whole jar, gain 100 pounds, and become a cookie monster!' Maybe… but that's not automatic.",
			examples: [
				"'If we let students redo one test, soon they'll want to redo everything and school will be meaningless!'",
				"'If we allow this, next thing you know, total chaos will reign!'"
			]
		},
		'tu-quoque': {
			term: 'Tu Quoque',
			eli12:
				"This means 'you too!' in Latin. It's when someone dismisses your argument by saying you're a hypocrite. Like if you tell your friend 'smoking is bad for you' and they say 'well YOU ate candy yesterday!' Your candy-eating doesn't make smoking healthy—two wrongs don't make a right!",
			examples: [
				"You: 'We should reduce carbon emissions.'\nThem: 'You drive a car, hypocrite!'",
				"You: 'Lying is wrong.'\nThem: 'You lied last week, so I can ignore your point.'"
			]
		}
	};

	const manipulativePatternExplanations: Record<string, Explanation> = {
		'thought-terminating': {
			term: 'Thought-Terminating Clichés',
			eli12:
				"These are phrases people use to stop you from asking questions or thinking deeper. It's like when you ask 'why?' and someone says 'Because I said so!' or 'It is what it is.' They're basically saying 'stop thinking about this'—which is the opposite of what good arguments should do!",
			examples: [
				"'It is what it is.'",
				"'Boys will be boys.'",
				"'That's just how things are.'",
				"'Don't ask questions, just have faith.'"
			]
		},
		'loaded-language': {
			term: 'Loaded Language',
			eli12:
				"Using super emotional words to make you feel a certain way instead of thinking clearly. It's like calling someone a 'freedom fighter' if you like them or a 'terrorist' if you don't—when they're doing the same actions. The emotional words are trying to control how you feel instead of what you think.",
			examples: [
				"'Tax relief' vs 'tax cuts for the rich' (same policy, different emotion)",
				"'Enhanced interrogation' vs 'torture' (same action, different feeling)",
				"'Undocumented immigrant' vs 'illegal alien' (same person, different emotion)"
			]
		},
		'in-group-out-group': {
			term: 'In-Group / Out-Group Labeling',
			eli12:
				"Creating an 'us vs them' situation where if you're not in the 'good' group, you're automatically bad. It's like saying 'real fans' vs 'fake fans'—if you question anything, you're kicked out and labeled as one of THEM. This shuts down discussion because nobody wants to be the 'bad guy.'",
			examples: [
				"'You're either a TRUE patriot or you're against us.'",
				"'Real environmentalists would agree with me.'",
				"'If you question this, you're one of THEM.'"
			]
		},
		'reframing-dissent': {
			term: 'Reframing Dissent as Moral Failing',
			eli12:
				"Making disagreement seem like you're a bad person, not just someone with a different opinion. It's like if you said 'I don't like pineapple on pizza' and someone replied 'Wow, you must hate Italian culture and tradition!' They're making your simple opinion sound like a moral crime.",
			examples: [
				"'If you don't support this policy, you don't care about children.'",
				"'Questioning our methods means you're okay with people suffering.'",
				"'Disagreeing with me means you're part of the problem.'"
			]
		},
		'information-gating': {
			term: 'Information Gating / Jargon Flooding',
			eli12:
				"Using unnecessarily complicated words or made-up terms to make simple ideas sound super complex and special. It's like if someone said 'We need to utilize atmospheric H2O optimization protocols' instead of just saying 'close the window when it rains.' It makes you feel like you need THEM to understand, when really they're just overcomplicating things.",
			examples: [
				'Using 50 technical terms when simple language would work',
				'Creating special vocabulary that only insiders understand',
				"Saying 'You wouldn't understand unless you've studied our framework'"
			]
		},
		'purity-spirals': {
			term: 'Purity Spirals',
			eli12:
				"When the standards keep getting stricter and stricter until nobody is 'good enough' anymore. It's like starting with 'don't litter' being good enough, then it becomes 'recycle everything,' then 'zero waste,' then 'grow all your own food,' then 'live in a cave.' Anyone who doesn't meet the newest, highest standard is now considered bad—even if they were following the old standards perfectly.",
			examples: [
				"'You recycle? That's not enough, you must be zero-waste or you don't care.'",
				"'You support X? Well I support X PLUS Y and Z, so you're not a real supporter.'",
				"Constantly raising the bar so moderate supporters become 'the enemy'"
			]
		},
		'love-bombing': {
			term: 'Love Bombing',
			eli12:
				"Showering someone with tons of praise and attention super quickly to make them trust you before they should. It's like if someone you just met yesterday says 'You're my BEST FRIEND EVER and the SMARTEST person alive!' They're trying to make you feel so good that you'll agree with them without thinking critically.",
			examples: [
				"'You're so much smarter than everyone else here!'",
				"'Finally, someone who truly GETS it like you do!'",
				'Excessive flattery when you agree, coldness when you question'
			]
		},
		'false-urgency': {
			term: 'False Urgency / Crisis Framing',
			eli12:
				"Making everything seem like an emergency so you don't have time to think carefully. It's like saying 'DECIDE RIGHT NOW or everything will be RUINED FOREVER!' When people rush you, it's often because they don't want you to think too hard about whether their idea is actually good.",
			examples: [
				"'We have to act NOW or it's too late!'",
				"'There's no time to think, we must decide immediately!'",
				"'If we don't do this TODAY, everything will collapse!'"
			]
		},
		'absolutist-binaries': {
			term: 'Absolutist Binaries',
			eli12:
				"Pretending complicated issues are simple 'always' or 'never' situations. Real life is usually more like 'sometimes' or 'it depends.' It's like saying 'You ALWAYS leave your socks on the floor!' when really it happened twice. These absolute words ('always,' 'never,' 'all,' 'none') ignore the complexity of real situations.",
			examples: [
				"'You NEVER listen to me!' (probably not literally never)",
				"'EVERYONE thinks this way!' (probably not literally everyone)",
				"'This is 100% good with zero downsides!' (very rare in reality)"
			]
		},
		mystification: {
			term: 'Mystification',
			eli12:
				"Claiming to have special secret knowledge that makes them right, but refusing to explain or prove it. It's like saying 'I just KNOW I'm right because I have special insight you don't have.' They want you to trust them instead of letting you see the evidence yourself. Real experts can explain things clearly!",
			examples: [
				"'You wouldn't understand, you haven't had the experience I have.'",
				"'I just know this in my gut, trust me.'",
				"'Once you're enlightened like me, you'll see I'm right.'"
			]
		}
	};

	function openModal(explanation: Explanation) {
		selectedExplanation = explanation;
		showModal = true;
	}

	function closeModal() {
		showModal = false;
		selectedExplanation = null;
	}
</script>

<div class="guide-container">
	<h1 class="guide-title">How to Craft Good-Faith Arguments</h1>
	<p class="intro">
		Good-faith argumentation is about seeking truth, understanding, and constructive progress—rather
		than simply winning. This guide provides practical principles to help you participate
		productively in ReasonSmith discussions.
	</p>

	<ol class="principles">
		<li>
			<h2>1. Clarify the Claim</h2>
			<p>
				State your thesis clearly. Define key terms. Avoid ambiguity that could derail the
				discussion later.
			</p>
		</li>
		<li>
			<h2>2. Steelman Before You Counter</h2>
			<p>
				Restate the other contributor's position in a way they would endorse before offering
				critique. This builds mutual understanding.
			</p>
		</li>
		<li>
			<h2>3. Separate Claims from Evidence</h2>
			<p>
				Label assertions vs. support. Cite sources (with links where possible) and indicate when you
				are offering inference vs. citation.
			</p>
		</li>
		<li>
			<h2>4. Disclose Assumptions</h2>
			<p>
				Surface underlying premises (ethical frameworks, models, definitions). Unstated assumptions
				are a common source of friction.
			</p>
		</li>
		<li>
			<h2>5. Distinguish Levels of Disagreement</h2>
			<p>
				Identify whether you contest data, interpretation, values, scope, or practical implications.
				Target the correct layer.
			</p>
		</li>
		<li>
			<h2>6. Use Proportional Language</h2>
			<p>
				Avoid overstatements. Calibrate confidence (e.g., "I tentatively infer…" vs. "It is
				certain…").
			</p>
		</li>
		<li>
			<h2>7. Engage with the Strongest Point</h2>
			<p>Do not cherry-pick weaker phrasing to rebut. Address the core logic or evidence chain.</p>
		</li>
		<li>
			<h2>8. Separate Person from Position</h2>
			<p>
				Avoid attributing motives. Critique reasoning, not character. Assume competence unless
				disproven.
			</p>
		</li>
		<li>
			<h2>9. Acknowledge Valid Points</h2>
			<p>
				Explicitly concede when the other side makes a fair correction or adds nuance. This
				increases credibility.
			</p>
		</li>
		<li>
			<h2>10. Propose Next Questions</h2>
			<p>
				Good debates generate better questions. Suggest concrete follow-ups, data to gather, or
				narrower sub-issues to explore.
			</p>
		</li>
	</ol>

	<section class="framework">
		<h2>A Simple Response Framework</h2>
		<pre class="snippet"><code
				>Steelman: &lt;their refined claim&gt;
Position: &lt;your claim&gt;
Support: &lt;evidence / reasoning&gt;
Assumptions: &lt;key premises&gt;
Counterpoints: &lt;targeted critiques, not scattershot&gt;
Open Questions: &lt;areas needing clarification or data&gt;</code
			></pre>
	</section>

	<section class="checklist">
		<h2>Pre-Post Checklist</h2>
		<ul>
			<li>Have I represented others' views fairly?</li>
			<li>Did I cite or qualify key factual claims?</li>
			<li>Are my assumptions explicit?</li>
			<li>Have I avoided rhetorical heat?</li>
			<li>Did I add value (clarification, synthesis, evidence)?</li>
		</ul>
	</section>

	<section class="fallacies">
		<h2>Common Logical Fallacies (Recognize & Avoid)</h2>
		<ul class="grid-list">
			<li>
				<div class="item-content">
					<div>
						<strong>Straw Man</strong>: Misrepresenting a position to make it easier to attack.
						Steelman instead.
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(fallacyExplanations['straw-man'])}
						aria-label="Explain Straw Man"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
			<li>
				<div class="item-content">
					<div>
						<strong>Ad Hominem</strong>: Attacking the person not the argument. Address reasoning.
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(fallacyExplanations['ad-hominem'])}
						aria-label="Explain Ad Hominem"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
			<li>
				<div class="item-content">
					<div>
						<strong>Motte-and-Bailey</strong>: Retreating to a safer vague claim when challenged on
						a strong one.
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(fallacyExplanations['motte-and-bailey'])}
						aria-label="Explain Motte-and-Bailey"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
			<li>
				<div class="item-content">
					<div><strong>False Dichotomy</strong>: Presenting only two options when more exist.</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(fallacyExplanations['false-dichotomy'])}
						aria-label="Explain False Dichotomy"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
			<li>
				<div class="item-content">
					<div>
						<strong>Moving the Goalposts</strong>: Raising the standard after evidence is provided.
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(fallacyExplanations['moving-goalposts'])}
						aria-label="Explain Moving the Goalposts"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
			<li>
				<div class="item-content">
					<div>
						<strong>Whataboutism</strong>: Deflecting critique by pointing to a different issue.
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(fallacyExplanations['whataboutism'])}
						aria-label="Explain Whataboutism"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
			<li>
				<div class="item-content">
					<div>
						<strong>Appeal to (Unqualified) Authority</strong>: Citing expertise irrelevant to the
						claim's domain.
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(fallacyExplanations['appeal-to-authority'])}
						aria-label="Explain Appeal to Authority"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
			<li>
				<div class="item-content">
					<div>
						<strong>Cherry Picking</strong>: Selecting only favorable data; ignore the total
						evidence set.
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(fallacyExplanations['cherry-picking'])}
						aria-label="Explain Cherry Picking"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
			<li>
				<div class="item-content">
					<div>
						<strong>Slippery Slope</strong>: Claiming outcome escalation without a causal chain.
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(fallacyExplanations['slippery-slope'])}
						aria-label="Explain Slippery Slope"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
			<li>
				<div class="item-content">
					<div>
						<strong>Tu Quoque</strong>: Dismissing an argument due to the arguer's inconsistency.
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(fallacyExplanations['tu-quoque'])}
						aria-label="Explain Tu Quoque"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
		</ul>
	</section>

	<section class="cult-language">
		<h2>Common Cultish / Manipulative Language Patterns</h2>
		<p class="section-intro">
			These rhetorical techniques suppress dissent, enforce conformity, or short-circuit scrutiny.
			Flag them early.
		</p>
		<ul class="grid-list">
			<li>
				<div class="item-content">
					<div>
						<strong>Thought-Terminating Clichés</strong>: Stock phrases that end inquiry ("It just
						is.")
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(manipulativePatternExplanations['thought-terminating'])}
						aria-label="Explain Thought-Terminating Clichés"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
			<li>
				<div class="item-content">
					<div>
						<strong>Loaded Language</strong>: Emotionally charged terms replacing neutral
						description.
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(manipulativePatternExplanations['loaded-language'])}
						aria-label="Explain Loaded Language"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
			<li>
				<div class="item-content">
					<div>
						<strong>In-Group / Out-Group Labeling</strong>: Moralizing identity boundaries to
						delegitimize critique.
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(manipulativePatternExplanations['in-group-out-group'])}
						aria-label="Explain In-Group / Out-Group Labeling"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
			<li>
				<div class="item-content">
					<div>
						<strong>Reframing Dissent as Moral Failing</strong>: Equating disagreement with
						disloyalty or harm.
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(manipulativePatternExplanations['reframing-dissent'])}
						aria-label="Explain Reframing Dissent as Moral Failing"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
			<li>
				<div class="item-content">
					<div>
						<strong>Information Gating / Jargon Flooding</strong>: Obscuring simple concepts behind
						proprietary terms.
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(manipulativePatternExplanations['information-gating'])}
						aria-label="Explain Information Gating / Jargon Flooding"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
			<li>
				<div class="item-content">
					<div>
						<strong>Purity Spirals</strong>: Ever-tightening standards that render moderation
						suspect.
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(manipulativePatternExplanations['purity-spirals'])}
						aria-label="Explain Purity Spirals"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
			<li>
				<div class="item-content">
					<div>
						<strong>Love Bombing</strong>: Excessive praise to fast-track trust or compliance.
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(manipulativePatternExplanations['love-bombing'])}
						aria-label="Explain Love Bombing"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
			<li>
				<div class="item-content">
					<div>
						<strong>False Urgency / Crisis Framing</strong>: Pressuring decisions by invoking
						existential stakes.
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(manipulativePatternExplanations['false-urgency'])}
						aria-label="Explain False Urgency / Crisis Framing"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
			<li>
				<div class="item-content">
					<div>
						<strong>Absolutist Binaries</strong>: Presenting nuance-heavy issues as all-or-nothing.
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(manipulativePatternExplanations['absolutist-binaries'])}
						aria-label="Explain Absolutist Binaries"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
			<li>
				<div class="item-content">
					<div>
						<strong>Mystification</strong>: Claiming special access to truth to evade evidence
						requests.
					</div>
					<button
						type="button"
						class="huh-button"
						onclick={() => openModal(manipulativePatternExplanations['mystification'])}
						aria-label="Explain Mystification"
					>
						<Info size={16} />
					</button>
				</div>
			</li>
		</ul>
		<p class="tip">
			When you notice these, ask for clarification, criteria, or evidence instead of mirroring tone.
		</p>
	</section>
</div>

<!-- Explanation Modal -->
{#if showModal && selectedExplanation}
	<div class="modal-backdrop" onclick={closeModal} role="dialog" aria-modal="true">
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3>{selectedExplanation.term}</h3>
				<button type="button" class="close-button" onclick={closeModal} aria-label="Close modal">
					<X size={24} />
				</button>
			</div>
			<div class="modal-body">
				<div class="eli12-section">
					<p>{selectedExplanation.eli12}</p>
				</div>
				<div class="examples-section">
					<h4>Examples:</h4>
					<ul>
						{#each selectedExplanation.examples as example}
							<li>{example}</li>
						{/each}
					</ul>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.guide-container {
		max-width: 900px;
		margin: 2rem auto;
		padding: 2rem;
	}
	.guide-title {
		font-size: 2.25rem;
		font-weight: 700;
		font-family: var(--font-family-display);
		margin-bottom: 1rem;
	}
	.intro {
		font-size: 1.05rem;
		color: var(--color-text-secondary);
		margin-bottom: 2rem;
		line-height: 1.5;
	}
	.principles {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 1.75rem;
		margin: 0 0 2.5rem;
	}
	.principles h2 {
		font-size: 1.1rem;
		font-weight: 600;
		margin-bottom: 0.4rem;
	}
	.principles p {
		margin: 0;
		line-height: 1.5;
	}
	.framework {
		margin-bottom: 2.5rem;
	}
	.framework h2,
	.checklist h2,
	.fallacies h2,
	.cult-language h2 {
		font-size: 1.25rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
	}
	.snippet {
		background: var(--color-surface);
		padding: 1rem;
		border: 1px solid var(--color-border);
		border-radius: var(--border-radius-md);
		overflow-x: auto;
		font-size: 0.85rem;
		line-height: 1.4;
	}
	.checklist ul {
		list-style: disc;
		padding-left: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.fallacies,
	.cult-language {
		margin-top: 2.5rem;
	}
	.grid-list {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 0.75rem;
		grid-template-columns: 1fr;
		margin: 0 0 1.5rem;
	}
	@media (min-width: 720px) {
		.grid-list {
			grid-template-columns: 1fr 1fr;
		}
	}
	.grid-list li {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		padding: 0.75rem 0.9rem;
		border-radius: var(--border-radius-sm);
		font-size: 0.85rem;
		line-height: 1.35;
	}

	/* Item content with button layout */
	.item-content {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.item-content > div {
		flex: 1;
	}

	/* Info button styling */
	.huh-button {
		background: transparent;
		border: 1px solid var(--color-border);
		border-radius: 50%;
		padding: 0.375rem;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all 0.2s ease;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
	}

	.huh-button:hover {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
		transform: scale(1.1);
	}

	/* Modal styles */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
		animation: fadeIn 0.2s ease;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.modal-content {
		background: var(--color-surface);
		border-radius: var(--border-radius-lg);
		max-width: 600px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		animation: slideUp 0.3s ease;
	}

	@keyframes slideUp {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem;
		border-bottom: 1px solid var(--color-border);
	}

	.modal-header h3 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-text-primary);
		font-family: var(--font-family-display);
	}

	.close-button {
		background: transparent;
		border: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--border-radius-sm);
		transition: all 0.2s ease;
	}

	.close-button:hover {
		background: var(--color-surface);
		color: var(--color-text-primary);
	}

	.modal-body {
		padding: 1.5rem;
	}

	.eli12-section {
		margin-bottom: 1.5rem;
	}

	.eli12-section h4 {
		margin: 0 0 0.75rem 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-primary);
	}

	.eli12-section p {
		margin: 0;
		line-height: 1.6;
		color: var(--color-text-primary);
		font-size: 0.95rem;
	}

	.examples-section h4 {
		margin: 0 0 0.75rem 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-primary);
	}

	.examples-section ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.examples-section li {
		background: var(--color-surface);
		padding: 1rem;
		border-radius: var(--border-radius-sm);
		border-left: 3px solid var(--color-primary);
		font-size: 0.9rem;
		line-height: 1.5;
		white-space: pre-wrap;
		color: var(--color-text-primary);
	}

	.section-intro {
		font-size: 0.95rem;
		color: var(--color-text-secondary);
		margin-bottom: 0.75rem;
	}
	.tip {
		font-size: 0.85rem;
		color: var(--color-text-secondary);
		margin-top: -0.5rem;
	}
	@media (max-width: 640px) {
		.guide-container {
			padding: 1.25rem;
		}
		.guide-title {
			font-size: 1.85rem;
		}
		.modal-content {
			max-height: 95vh;
		}
		.modal-header,
		.modal-body {
			padding: 1rem;
		}
	}
</style>
