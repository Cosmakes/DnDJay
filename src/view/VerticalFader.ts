/**
 * A custom vertical fader (the channel volume control). Obsidian's Slider
 * component is horizontal and can't be coloured per-channel, so this is a small
 * pointer-driven control whose fill uses the channel colour (§3.1).
 */
export interface FaderOptions {
	value: number; // 0..1
	color: string;
	onInput: (value: number) => void;
}

export function createVerticalFader(parent: HTMLElement, opts: FaderOptions): void {
	const fader = parent.createDiv({ cls: 'dndjay-fader' });
	const track = fader.createDiv({ cls: 'dndjay-fader-track' });
	const fill = track.createDiv({ cls: 'dndjay-fader-fill' });
	const thumb = track.createDiv({ cls: 'dndjay-fader-thumb' });
	fill.style.backgroundColor = opts.color;
	thumb.style.borderColor = opts.color;

	let value = clamp01(opts.value);

	const apply = () => {
		const pct = (value * 100).toFixed(1) + '%';
		fill.style.height = pct;
		thumb.style.bottom = `calc(${pct} - 6px)`;
	};
	apply();

	const valueFromEvent = (clientY: number): number => {
		const rect = track.getBoundingClientRect();
		const fromBottom = rect.bottom - clientY;
		return clamp01(fromBottom / rect.height);
	};

	let dragging = false;
	const onMove = (e: PointerEvent) => {
		if (!dragging) return;
		value = valueFromEvent(e.clientY);
		apply();
		opts.onInput(value);
	};

	fader.addEventListener('pointerdown', (e: PointerEvent) => {
		dragging = true;
		fader.setPointerCapture(e.pointerId);
		value = valueFromEvent(e.clientY);
		apply();
		opts.onInput(value);
		e.preventDefault();
	});
	fader.addEventListener('pointermove', onMove);
	const end = (e: PointerEvent) => {
		dragging = false;
		try {
			fader.releasePointerCapture(e.pointerId);
		} catch {
			/* ignore */
		}
	};
	fader.addEventListener('pointerup', end);
	fader.addEventListener('pointercancel', end);

	// Scroll-wheel nudge for fine control.
	fader.addEventListener('wheel', (e: WheelEvent) => {
		value = clamp01(value - Math.sign(e.deltaY) * 0.04);
		apply();
		opts.onInput(value);
		e.preventDefault();
	});
}

function clamp01(v: number): number {
	return Math.min(1, Math.max(0, v));
}
