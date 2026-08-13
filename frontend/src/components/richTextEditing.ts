export interface MarkdownTextEdit {
  replaceStart: number;
  replaceEnd: number;
  replacement: string;
  selectionStart: number;
  selectionEnd: number;
}

export const boldMarkdownEdit = (value: string, selectionStart: number, selectionEnd: number): MarkdownTextEdit => {
  const selected = value.slice(selectionStart, selectionEnd);

  if (selected.startsWith('**') && selected.endsWith('**') && selected.length >= 4) {
    const replacement = selected.slice(2, -2);
    return {
      replaceStart: selectionStart,
      replaceEnd: selectionEnd,
      replacement,
      selectionStart,
      selectionEnd: selectionStart + replacement.length
    };
  }

  if (selectionStart >= 2 && value.slice(selectionStart - 2, selectionStart) === '**' && value.slice(selectionEnd, selectionEnd + 2) === '**') {
    return {
      replaceStart: selectionStart - 2,
      replaceEnd: selectionEnd + 2,
      replacement: selected,
      selectionStart: selectionStart - 2,
      selectionEnd: selectionEnd - 2
    };
  }

  if (selectionStart === selectionEnd) {
    return {
      replaceStart: selectionStart,
      replaceEnd: selectionEnd,
      replacement: '****',
      selectionStart: selectionStart + 2,
      selectionEnd: selectionStart + 2
    };
  }

  return {
    replaceStart: selectionStart,
    replaceEnd: selectionEnd,
    replacement: `**${selected}**`,
    selectionStart: selectionStart + 2,
    selectionEnd: selectionEnd + 2
  };
};

export const indentMarkdownEdit = (value: string, selectionStart: number, selectionEnd: number, outdent = false): MarkdownTextEdit => {
  if (!outdent && selectionStart === selectionEnd) {
    return {
      replaceStart: selectionStart,
      replaceEnd: selectionEnd,
      replacement: '\t',
      selectionStart: selectionStart + 1,
      selectionEnd: selectionEnd + 1
    };
  }

  const lineStart = value.lastIndexOf('\n', Math.max(0, selectionStart - 1)) + 1;
  const effectiveEnd = selectionEnd > selectionStart && value[selectionEnd - 1] === '\n' ? selectionEnd - 1 : selectionEnd;
  const nextLineBreak = value.indexOf('\n', effectiveEnd);
  const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
  const lines = value.slice(lineStart, lineEnd).split('\n');

  if (!outdent) {
    return {
      replaceStart: lineStart,
      replaceEnd: lineEnd,
      replacement: lines.map(line => `\t${line}`).join('\n'),
      selectionStart: selectionStart + 1,
      selectionEnd: selectionEnd + lines.length
    };
  }

  const removedLengths = lines.map(line => line.startsWith('\t') ? 1 : Math.min(line.match(/^ +/)?.[0].length || 0, 4));
  const replacement = lines.map((line, index) => line.slice(removedLengths[index])).join('\n');
  const removedBeforeStart = removedLengths[0];
  const removedBeforeEnd = removedLengths.reduce((total, length) => total + length, 0);

  return {
    replaceStart: lineStart,
    replaceEnd: lineEnd,
    replacement,
    selectionStart: Math.max(lineStart, selectionStart - removedBeforeStart),
    selectionEnd: Math.max(lineStart, selectionEnd - removedBeforeEnd)
  };
};

const applyTextareaEdit = (textarea: HTMLTextAreaElement, edit: MarkdownTextEdit) => {
  textarea.setSelectionRange(edit.replaceStart, edit.replaceEnd);

  const insertedWithUndo = document.execCommand('insertText', false, edit.replacement);
  if (!insertedWithUndo) {
    textarea.setRangeText(edit.replacement, edit.replaceStart, edit.replaceEnd, 'end');
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: edit.replacement }));
  }

  // Keep consecutive shortcuts deterministic. Waiting only for the next frame
  // lets a fast Shift+Tab read the browser's intermediate selection instead.
  textarea.focus();
  textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  window.requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  });
};

export const applyMarkdownBold = (textarea: HTMLTextAreaElement) => {
  applyTextareaEdit(textarea, boldMarkdownEdit(textarea.value, textarea.selectionStart, textarea.selectionEnd));
};

export const applyMarkdownIndent = (textarea: HTMLTextAreaElement, outdent = false) => {
  applyTextareaEdit(textarea, indentMarkdownEdit(textarea.value, textarea.selectionStart, textarea.selectionEnd, outdent));
};
