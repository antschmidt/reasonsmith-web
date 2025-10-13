<script lang="ts">
	export let size: string | number = '100px';
	export let isAnimating: boolean = true;

	// Normalize size to always be a string with units
	$: normalizedSize = typeof size === 'number' ? `${size}px` : size;
</script>

<div class="animated-logo" class:animating={isAnimating} style="width: {normalizedSize}; height: {normalizedSize};">
	<svg id="animated-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 342.75 351">
		<defs>
			<style>
				.cls-1 {
					fill: #fff;
				}
				.anvil {
					fill: #4a5568;
				}
				.hammer {
					fill: #8b4513;
					transform-origin: 160px 100px; /* Pivot point for hammer swing */
				}
				.handle {
					fill: #654321;
					transform-origin: 160px 100px; /* Same pivot point as hammer head */
				}
				.sparks {
					fill: #ffd700;
					opacity: 0;
				}
			</style>
		</defs>

		<!-- Background -->
		<rect width="342.75" height="351" fill="transparent" />

		<!-- Anvil base and body (static) -->
		<path
			class="anvil"
			d="M268.66,154.17c.08,9.39-7.77,20.25-15.03,25.75-18.98,14.38-55.39,4.44-78.07,8.74-4.16.79-5.21,2.07-5.68,6.29-1.4,12.57.91,27.38,1.07,40.09,7.15,2.43,14.18.28,20.25,5.94,19.82,27.64,35.22,60.89,64.74,79.7v17.59h-37.04c-1.61,0-7.13-4.09-9.2-5.02-15.73-7.08-43.8-7.15-59.54-.11-1.84.82-7.85,5.13-8.34,5.13h-39.66l-1.12-1.12v-17.21c25.85-11.85,56.52-41.13,44.72-72.42-5.13-13.59-15.55-17.89-28.26-22.63v-70.72h151.17Z"
		/>

		<!-- Anvil working surface -->
		<path
			class="anvil"
			d="M19.08,164.65h88.31c1.07.66,1.03,1.49,1.16,2.58,1.51,12.83-.24,31.45-.5,44.82-.04,2.22,2.06,8.5-1.4,8.75-1.63.12-14.17-3.5-16.68-4.3-18.73-5.96-42.8-17.81-57.8-30.51-4.3-3.64-16.07-14.01-14.1-20.1l1.01-1.24Z"
		/>

		<!-- Hammer head (animated) -->
		<path
			class="hammer"
			d="M159.88,25.71c2.7,3.1,1.64,4.06-.18,7.15l-55.13,71.7c-4.6,1.91-11.54-4.49-15.13-7.29-2.59-2.02-12.93-10.41-13.06-13.05-.07-1.48,1.25-3.42,2.01-4.69,8.38-14.1,24.72-32.93,35.38-46.19,6.32-7.86,12.57-15.81,19.46-23.19,3.19-2.51,6.24-.44,9.17,1.23,4.08,2.33,14.41,10.82,17.47,14.33Z"
		/>

		<!-- Hammer handle (animated) -->
		<path
			class="handle"
			d="M218.82,136.65c-26.46-19.68-51.98-40.78-79.59-58.88l13.41-19.82c17.46,9.36,33.18,21.75,49.61,32.77,14.65,9.84,29.89,18.82,44.25,29.09,2.29,2.67,2.51,4.59,1.37,7.95-.6,1.78-9.61,14.09-11.12,15.07-6.8,4.42-12.75-2.34-17.94-6.2Z"
		/>

		<!-- Right side of logo -->
		<path
			class="anvil"
			d="M178.86,197.58c1.37-.35,2.64-.67,4.08-.79,20.66-1.63,42.11,3.38,62.16-2.94,50.91-16.06,44.42-89.05-9.92-91.88l-49.09-33.08-.5-2.28,62.52.72c75.15,5.7,96.03,105.51,35.75,146.57-9.94,6.77-15.97,8.34-27.54,10.64-.94.19-1.33-.55-1.14,1.11l75.62,112.22c-.08.57-2.6.88-3.25.87-12.76-.19-25.55-.86-38.34-.43l-2.26-.73-75.48-109.37c-2.78-2-8.77,0-12,.08-5.22.12-13.12.58-18.03,0-1.09-.13-1.92-.09-2.58-1.16v-29.56Z"
		/>

		<!-- Impact sparks (animated) -->
		<g class="sparks">
			<circle cx="120" cy="160" r="3" />
			<circle cx="130" cy="155" r="2" />
			<circle cx="110" cy="165" r="2.5" />
			<circle cx="125" cy="170" r="1.5" />
			<circle cx="135" cy="162" r="2" />
		</g>
	</svg>
</div>

<style>
	.animated-logo {
		display: inline-block;
	}

	.animated-logo svg {
		width: 100%;
		height: 100%;
	}

	.animated-logo.animating .hammer,
	.animated-logo.animating .handle {
		animation: hammerStrike 1.2s ease-in-out infinite;
	}

	.animated-logo.animating .sparks {
		animation: sparkle 1.2s ease-in-out infinite;
	}

	@keyframes hammerStrike {
		0% {
			transform: rotate(-45deg);
		}
		15% {
			transform: rotate(-35deg);
		}
		30% {
			transform: rotate(-20deg);
		}
		45% {
			transform: rotate(-5deg);
		}
		50% {
			transform: rotate(0deg);
		}
		55% {
			transform: rotate(3deg);
		}
		60% {
			transform: rotate(0deg);
		}
		75% {
			transform: rotate(-15deg);
		}
		90% {
			transform: rotate(-35deg);
		}
		100% {
			transform: rotate(-45deg);
		}
	}

	@keyframes sparkle {
		0%,
		55% {
			opacity: 0;
			transform: scale(0);
		}
		60% {
			opacity: 1;
			transform: scale(1.2);
		}
		70% {
			opacity: 0.8;
			transform: scale(1);
		}
		80% {
			opacity: 0;
			transform: scale(0.8);
		}
		100% {
			opacity: 0;
			transform: scale(0);
		}
	}

	/* Pause animation when not animating */
	.animated-logo:not(.animating) .hammer,
	.animated-logo:not(.animating) .handle {
		animation-play-state: paused;
		transform: rotate(-45deg);
	}

	.animated-logo:not(.animating) .sparks {
		animation-play-state: paused;
		opacity: 0;
	}
</style>
