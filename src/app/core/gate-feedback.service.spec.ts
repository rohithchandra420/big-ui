import { TestBed } from '@angular/core/testing';

import { GateFeedbackService } from './gate-feedback.service';

// A fake Web Audio context that records the tones played.
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state = 'suspended';
  currentTime = 0;
  destination = {};
  tones: { type: string; freq: number }[] = [];
  resume = jasmine.createSpy('resume').and.returnValue(Promise.resolve());
  constructor() { FakeAudioContext.instances.push(this); }
  createOscillator() {
    const osc: any = {
      type: '', frequency: { value: 0 },
      connect: () => { },
      start: () => this.tones.push({ type: osc.type, freq: osc.frequency.value }),
      stop: () => { }
    };
    return osc;
  }
  createGain() {
    return { gain: { setValueAtTime: () => { }, exponentialRampToValueAtTime: () => { } }, connect: () => { } };
  }
}

describe('GateFeedbackService', () => {
  let service: GateFeedbackService;
  let vibrateSpy: jasmine.Spy;
  let originalCtor: any;
  const ctx = () => FakeAudioContext.instances[FakeAudioContext.instances.length - 1];

  beforeEach(() => {
    localStorage.removeItem('big.gateFeedback.muted');
    FakeAudioContext.instances = [];
    originalCtor = (window as any).AudioContext;
    (window as any).AudioContext = FakeAudioContext;
    if (typeof navigator.vibrate !== 'function') {
      (navigator as any).vibrate = () => true;
    }
    vibrateSpy = spyOn(navigator, 'vibrate').and.returnValue(true);
    TestBed.configureTestingModule({});
    service = TestBed.inject(GateFeedbackService);
  });

  afterEach(() => {
    (window as any).AudioContext = originalCtor;
    localStorage.removeItem('big.gateFeedback.muted');
  });

  it('found() plays a rising two-note chime and one short pulse', () => {
    service.found();
    expect(ctx().tones.map(t => t.freq)).toEqual([880, 1320]);
    expect(vibrateSpy).toHaveBeenCalledWith([120]);
  });

  it('notFound() plays a low buzz and three quick pulses', () => {
    service.notFound();
    expect(ctx().tones).toEqual([{ type: 'square', freq: 180 }]);
    expect(vibrateSpy).toHaveBeenCalledWith([100, 60, 100, 60, 100]);
  });

  it('error() plays three falling notes and one long pulse', () => {
    service.error();
    expect(ctx().tones.map(t => t.freq)).toEqual([520, 390, 260]);
    expect(vibrateSpy).toHaveBeenCalledWith([400]);
  });

  it('unlock() resumes a suspended audio context', () => {
    service.unlock();
    expect(ctx().resume).toHaveBeenCalled();
  });

  it('stays silent and still when muted, and remembers the choice', () => {
    service.setMuted(true);
    service.found();
    service.notFound();
    service.error();
    expect(FakeAudioContext.instances.length).toBe(0);
    expect(vibrateSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('big.gateFeedback.muted')).toBe('1');
  });

  it('starts muted when this device was muted before', () => {
    localStorage.setItem('big.gateFeedback.muted', '1');
    const fresh = new GateFeedbackService();
    expect(fresh.muted).toBeTrue();
  });

  it('does not throw when the browser has no Web Audio', () => {
    const originalWebkit = (window as any).webkitAudioContext;
    (window as any).AudioContext = undefined;
    (window as any).webkitAudioContext = undefined;
    const noAudio = new GateFeedbackService();
    expect(() => noAudio.found()).not.toThrow();
    expect(vibrateSpy).toHaveBeenCalledWith([120]);
    (window as any).webkitAudioContext = originalWebkit;
  });
});
