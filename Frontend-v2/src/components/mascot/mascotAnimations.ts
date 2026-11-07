'use client';

/** Animated mascot pose presets for Bing Chun UI */
export type MascotPose =
  | 'idle'
  | 'peek-side'
  | 'cup-offer'
  | 'delivery'
  | 'takeaway'
  | 'wave'
  | 'celebrate';

export interface MascotAnimationSet {
  id: MascotPose;
  label: string;
  description: string;
}

export const MASCOT_ANIMATIONS: MascotAnimationSet[] = [
  { id: 'idle', label: 'Idle', description: 'Gentle floating bounce' },
  { id: 'peek-side', label: 'Peek', description: 'Slides in from the side on hover' },
  { id: 'cup-offer', label: 'Cup offer', description: 'Offers a Bing Chun cup' },
  { id: 'delivery', label: 'Delivery', description: 'Ready to deliver bubble tea' },
  { id: 'takeaway', label: 'Takeaway', description: 'Ready for store pickup' },
  { id: 'wave', label: 'Wave', description: 'Friendly welcome wave' },
  { id: 'celebrate', label: 'Celebrate', description: 'Happy dance after add to cup' },
];

export const POSE_BUBBLE: Partial<Record<MascotPose, string>> = {
  'cup-offer': '🧋 Fill your cup!',
  wave: '👋 Welcome!',
  celebrate: '🎉 Added to cup!',
  delivery: 'Delivery mode',
  takeaway: 'Takeaway mode',
};
