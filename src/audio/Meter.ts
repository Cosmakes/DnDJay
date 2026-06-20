import { AudioEngine } from './AudioEngine';

interface MeterTarget {
	channel: number;
	fillEl: HTMLElement; // its height (%) is driven each frame
	level: number; // smoothed 0..1, kept for graceful fall-off
}

/**
 * A single `requestAnimationFrame` loop that reads each bound channel's
 * post-fader `AnalyserNode` and writes a cheap height style to its meter fill.
 * Because the analyser is post-fader, muted/stopped channels read ~0.
 */
export class MeterController {
	private targets: MeterTarget[] = [];
	private raf: number | null = null;
	private buf: Float32Array<ArrayBuffer>;

	constructor(private engine: AudioEngine, private win: Window = window) {
		this.buf = new Float32Array(new ArrayBuffer(1024 * 4));
	}

	/** Re-point the loop at a fresh set of meter elements (after a re-render). */
	bind(targets: { channel: number; fillEl: HTMLElement }[]): void {
		this.targets = targets.map((t) => ({ ...t, level: 0 }));
	}

	start(): void {
		if (this.raf !== null) return;
		const tick = () => {
			this.update();
			this.raf = this.win.requestAnimationFrame(tick);
		};
		this.raf = this.win.requestAnimationFrame(tick);
	}

	stop(): void {
		if (this.raf !== null) {
			this.win.cancelAnimationFrame(this.raf);
			this.raf = null;
		}
	}

	private update(): void {
		for (const t of this.targets) {
			const analyser = this.engine.getAnalyser(t.channel);
			let level = 0;
			if (analyser) {
				const n = analyser.fftSize;
				if (this.buf.length !== n) this.buf = new Float32Array(n);
				analyser.getFloatTimeDomainData(this.buf);
				let sumSq = 0;
				for (let i = 0; i < n; i++) {
					const s = this.buf[i]!;
					sumSq += s * s;
				}
				const rms = Math.sqrt(sumSq / n);
				// Map RMS to a pleasant 0..1 throw; ~0.35 RMS ≈ full scale.
				level = Math.min(1, rms * 2.8);
			}
			// Fast attack, slow release so the meter doesn't strobe.
			t.level = level > t.level ? level : t.level * 0.86 + level * 0.14;
			t.fillEl.style.height = (t.level * 100).toFixed(1) + '%';
		}
	}
}
