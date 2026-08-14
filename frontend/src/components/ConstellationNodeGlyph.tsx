import type { ConstellationSkill } from './constellationTypes';

interface ConstellationNodeGlyphProps {
  skill: ConstellationSkill;
  label: string;
  labelOnLeft: boolean;
  labelY: number;
  isStart?: boolean;
}

function ConstellationNodeGlyph({
  skill,
  label,
  labelOnLeft,
  labelY,
  isStart
}: ConstellationNodeGlyphProps) {
  const role = skill.mapNodeRole || 'lesson';
  const labelDistance = role === 'capstone' ? 46 : role === 'boss' ? 43 : 34;
  const labelX = labelOnLeft ? -labelDistance : labelDistance;
  const textAnchor = labelOnLeft ? 'end' : 'start';
  const imageClipId = `constellation-node-image-${skill._id}`;
  const starPath = role === 'boss'
    ? 'M 0 -27 L 7 -11 L 24 -17 L 16 -2 L 28 8 L 10 10 L 7 28 L -4 13 L -21 23 L -15 5 L -29 -4 L -10 -8 Z'
    : role === 'capstone'
      ? 'M 0 -30 L 6 -13 L 21 -21 L 13 -6 L 30 0 L 13 6 L 21 21 L 6 13 L 0 30 L -6 13 L -21 21 L -13 6 L -30 0 L -13 -6 L -21 -21 L -6 -13 Z'
      : 'M 0 -24 L 7 -7 L 24 0 L 7 7 L 0 24 L -7 7 L -24 0 L -7 -7 Z';
  return (
    <>
      {skill.externalQuestId && skill.nodePreview?.imageUrl && (
        <defs><clipPath id={imageClipId}><circle r="17" /></clipPath></defs>
      )}
      <circle className="constellation-node-aura" r={role === 'capstone' ? 42 : role === 'boss' ? 34 : 36} />
      {(role === 'boss' || role === 'capstone') && (
        <circle className="constellation-role-ring" r={role === 'capstone' ? 36 : 34} />
      )}
      <path className="constellation-node-star" d={starPath} />
      {skill.externalQuestId && skill.nodePreview?.imageUrl ? (
        <>
          <image
            className="constellation-node-quest-image"
            href={skill.nodePreview.imageUrl}
            x="-17"
            y="-17"
            width="34"
            height="34"
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${imageClipId})`}
          />
          <circle className="constellation-node-image-ring" r="18" />
        </>
      ) : <circle className="constellation-node-core" r="7" />}
      <circle className="constellation-node-hit-target" r={role === 'capstone' ? 44 : 38} />
      {skill.mainQuestLevel && <text className="constellation-main-level" x="0" y="-48" textAnchor="middle">LEVEL {skill.mainQuestLevel}</text>}
      <text className="constellation-node-label" x={labelX} y={labelY} textAnchor={textAnchor}>{label}</text>
      {skill.mapNodeRole === 'boss' && <text className="constellation-node-kicker" x={labelX} y={labelY + 20} textAnchor={textAnchor}>BOSS QUEST</text>}
      {skill.mapNodeRole === 'capstone' && <text className="constellation-node-kicker" x={labelX} y={labelY + 20} textAnchor={textAnchor}>SUPER BOSS</text>}
      {isStart && <circle className="constellation-start-ring" r="31" />}
    </>
  );
}

export default ConstellationNodeGlyph;
