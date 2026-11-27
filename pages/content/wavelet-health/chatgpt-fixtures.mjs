export const fixtureUrl = 'https://chatgpt.com/c/synthetic-conversation';

export const baseline = [
  { id: 'existing_conversation', status: 'passed', failedAssertions: [] },
  { id: 'alternate_role_attribute', status: 'passed', failedAssertions: [] },
  { id: 'assistant_streaming', status: 'passed', failedAssertions: [] },
];

export function message(role, id, text, roleAttribute = 'data-message-author-role') {
  return `<div ${roleAttribute}="${role}" data-message-id="${id}">
    <div class="whitespace-pre-wrap">${text}</div>
  </div>`;
}

export function documentHtml(content) {
  return `<!doctype html><html lang="en"><head><title>Synthetic conversation</title></head>
    <body>${content}</body></html>`;
}
