export type ConstellationScope = 'discipline' | 'topic';
export type ConstellationType = 'main' | 'skill';
export type MapNodeRole = 'topic-gateway' | 'lesson' | 'boss' | 'capstone';

export interface ConstellationTheme {
  key: string;
  backgroundAssetUrl?: string;
  bakedBoundary?: {
    path: string;
    assetUrl: string;
    bounds: { x: number; y: number; width: number; height: number };
    generatedAt?: string;
  };
  frameStyle: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  lineColor: string;
  unlockedColor: string;
  availableColor: string;
  lockedColor: string;
  bossColor: string;
  capstoneColor: string;
}

export interface ConstellationMap {
  _id: string;
  name: string;
  slug: string;
  description: string;
  constellationType?: ConstellationType;
  scope: ConstellationScope;
  parentMapId?: string;
  gatewaySkillId?: string;
  displayOrder: number;
  isActive: boolean;
  level: number;
  visualTheme: ConstellationTheme;
  viewport: {
    width: number;
    height: number;
    minZoom: number;
    maxZoom: number;
  };
}

export interface ConstellationSkill {
  _id: string;
  title: string;
  description: string;
  cost: number;
  layer: number;
  position: number;
  treePosition?: { x: number; y: number };
  constellationPosition?: { x: number; y: number };
  constellationMapId?: string;
  constellationLabel?: string;
  mainQuestLevel?: number;
  mapNodeRole?: MapNodeRole;
  topicLevel?: number;
  nodePreview?: {
    imageUrl?: string;
    summary?: string;
    outcomes: string[];
    actionLabel: string;
  };
  externalSource?: 'office-quest' | 'hamquest' | 'star-master';
  externalQuestId?: string;
  questDataSource?: 'hamsterquest' | 'local';
  questDataStatus?: 'remote' | 'local-fallback' | 'missing';
  subQuests?: Array<{
    externalId?: string;
    title: string;
    description: string;
    descriptionParts?: Array<{ type: string; content: string }>;
    hintParts?: Array<{ type: string; content: string }>;
    hasHint?: boolean;
    type?: string;
  }>;
  isActive: boolean;
  isAdvancedLocked?: boolean;
  nodeColor: 'yellow' | 'blue' | 'green' | 'white' | 'purple';
  nodeType?: 'adventure' | 'asset' | 'quest' | 'marker' | 'EXTRA';
  prerequisites?: string[];
  connections?: Array<{
    targetSkillId: string;
    connectionType: 'normal' | 'special';
    hasArrowhead: boolean;
  }>;
}

export interface ConstellationTopicGroup {
  map: ConstellationMap;
  gateway?: ConstellationSkill | null;
  skills: ConstellationSkill[];
}
