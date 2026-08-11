import type { ReactElement } from 'react';

type InlineMarkdownNode = string | ReactElement;

const renderBold = (text: string, keyPrefix: string): InlineMarkdownNode[] => {
  const parts: InlineMarkdownNode[] = [];
  const boldPattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = boldPattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(<strong key={`${keyPrefix}-bold-${index++}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : [text];
};

export const renderInlineMarkdown = (text: string, baseKey: string | number): InlineMarkdownNode[] => {
  const parts: InlineMarkdownNode[] = [];
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = linkPattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(...renderBold(text.slice(lastIndex, match.index), `${baseKey}-${index}-before`));
    parts.push(
      <a key={`${baseKey}-link-${index}`} href={match[2]} target="_blank" rel="noopener noreferrer" style={{ color: '#4e98ff', textDecoration: 'underline', fontWeight: 500 }}>
        {renderBold(match[1], `${baseKey}-${index}-link`)}
      </a>
    );
    index += 1;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(...renderBold(text.slice(lastIndex), `${baseKey}-${index}-after`));
  return parts.length > 0 ? parts : [text];
};
