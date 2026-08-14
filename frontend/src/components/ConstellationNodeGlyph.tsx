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
  const labelX = labelOnLeft ? -34 : 34;
  const textAnchor = labelOnLeft ? 'end' : 'start';
  const role = skill.mapNodeRole || 'lesson';
  const imageClipId = `constellation-node-image-${skill._id}`;
  const starPath = role === 'boss'
    ? 'M 0 -30 L 8 -12 L 27 -19 L 18 -2 L 31 9 L 11 11 L 8 31 L -4 14 L -23 25 L -17 5 L -32 -4 L -11 -9 Z'
    : role === 'capstone'
      ? 'M 0 -34 L 7 -14 L 24 -24 L 14 -7 L 34 0 L 14 7 L 24 24 L 7 14 L 0 34 L -7 14 L -24 24 L -14 7 L -34 0 L -14 -7 L -24 -24 L -7 -14 Z'
      : 'M 0 -24 L 7 -7 L 24 0 L 7 7 L 0 24 L -7 7 L -24 0 L -7 -7 Z';
  return (
    <>
      {skill.externalQuestId && skill.nodePreview?.imageUrl && (
        <defs><clipPath id={imageClipId}><circle r="17" /></clipPath></defs>
      )}
      <circle className="constellation-node-aura" r={skill.mapNodeRole === 'capstone' ? 49 : 36} />
      {(role === 'boss' || role === 'capstone') && (
        <circle className="constellation-role-ring" r={role === 'capstone' ? 43 : 38} />
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
      {skill.mapNodeRole === 'boss' && <text className="constellation-node-kicker" x={labelX} y="25" textAnchor={textAnchor}>BOSS QUEST</text>}
      {skill.mapNodeRole === 'capstone' && <text className="constellation-node-kicker" x={labelOnLeft ? -40 : 40} y="28" textAnchor={textAnchor}>SUPER BOSS</text>}
      {isStart && <circle className="constellation-start-ring" r="31" />}
    </>
  );
}

export default ConstellationNodeGlyph;
