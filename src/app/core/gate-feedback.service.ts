import { Injectable } from '@angular/core';

const MUTE_KEY = 'big.gateFeedback.muted';

/**
 * Sound + vibration at the gate, so staff know the result of a scan or a
 * Look Up without reading the screen. Found = bright "ding-DING" + one
 * short pulse; Not Found = two harsh buzzes + two pulses; Error (lookup
 * failed) = three falling notes + one long pulse.
 *
 * Tones are generated with the Web Audio API (no audio files). Browsers keep
 * audio locked until the user taps something, so unlock() must be called
 * from a click (Scan QR / Look Up) before the result arrives.
 * Vibration isn't supported on iOS Safari — iPhones get the sound only.
 */
@Injectable({ providedIn: 'root' })
export class GateFeedbackService {

  private ctx: AudioContext | null = null;
  private _muted = this.readMuted();

  get muted(): boolean {
    return this._muted;
  }

  /** Per-device preference, remembered in this browser. */
  setMuted(muted: boolean): void {
    this._muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch { /* storage blocked — the toggle still works for this visit */ }
  }

  /** Call from a user tap so the result sound isn't blocked by the browser. */
  unlock(): void {
    const ctx = this.audio();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => { });
    }
  }

  found(): void {
    if (this._muted) return;
    this.tone(1047, 0, 0.14, 'sine', 0.35);
    this.tone(1568, 0.15, 0.35, 'sine', 0.35);
    this.vibrate([150]);
  }

  notFound(): void {
    if (this._muted) return;
    this.tone(140, 0, 0.22, 'sawtooth', 0.22);
    this.tone(140, 0.32, 0.22, 'sawtooth', 0.22);
    this.vibrate([200, 100, 200]);
  }

  /** The lookup itself failed (no connection, server problem) — not an answer about the booking. */
  error(): void {
    if (this._muted) return;
    this.tone(520, 0, 0.15, 'triangle');
    this.tone(390, 0.18, 0.15, 'triangle');
    this.tone(260, 0.36, 0.25, 'triangle');
    this.vibrate([400]);
  }

  private audio(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor() as AudioContext;
    } catch {
      return null;
    }
    return this.ctx;
  }

  private tone(freq: number, startAfter: number, duration: number, type: OscillatorType, volume = 0.25): void {
    const ctx = this.audio();
    if (!ctx) return;
    try {
      const start = ctx.currentTime + startAfter;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      // Short fade in/out so the tone doesn't click.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    } catch { /* audio unavailable — feedback is best-effort */ }
  }

  private vibrate(pattern: number[]): void {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch { /* not supported — ignore */ }
  }

  private readMuted(): boolean {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  }
}
