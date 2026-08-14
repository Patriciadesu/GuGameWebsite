export type MainQuestStatus = 'completed' | 'current' | 'pending' | 'future';

interface MainQuestStatusInput {
  questLevel?: number;
  userLevel: number;
  pending: boolean;
}

/** Main Quest progress is level-owned; legacy unlock records must never hide the current quest. */
export const resolveMainQuestStatus = ({ questLevel = 1, userLevel, pending }: MainQuestStatusInput): MainQuestStatus => {
  if (questLevel < userLevel) return 'completed';
  if (questLevel > userLevel) return 'future';
  return pending ? 'pending' : 'current';
};

export const mainQuestVisualStatus = (status: MainQuestStatus) => {
  if (status === 'completed') return 'unlocked';
  if (status === 'current') return 'available';
  if (status === 'pending') return 'pending';
  return 'locked';
};
