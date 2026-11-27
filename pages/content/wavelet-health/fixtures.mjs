export const fixtureUrl = 'https://www.youtube.com/shorts/fixture-first';

export const baseline = [
  { id: 'direct_landing', status: 'passed', failedAssertions: [] },
  { id: 'navigation_and_duplicates', status: 'passed', failedAssertions: [] },
  { id: 'changed_overlay', status: 'extraction_failure', failedAssertions: ['capture_count'] },
  { id: 'abbreviated_likes', status: 'value_mismatch', failedAssertions: ['likes'] },
];

export const firstPost = {
  id: 'fixture-first',
  title: 'Synthetic first Short',
  channel: 'fixture_alpha',
  likesLabel: '1,234 likes',
  commentsLabel: 'View 12 comments',
};

export const secondPost = {
  id: 'fixture-second',
  title: 'Synthetic second Short',
  channel: 'fixture_beta',
  likesLabel: '0 likes',
  commentsLabel: 'View 0 comments',
};

// Inputs are fixed synthetic strings, never website HTML or agent input.
export function overlay(post, tag = 'ytd-reel-player-overlay-renderer') {
  return `<${tag}>
    <a href="/@${post.channel}/shorts">Synthetic channel</a>
    <yt-shorts-video-title-view-model><h2>${post.title}</h2></yt-shorts-video-title-view-model>
    <like-button-view-model><button aria-label="${post.likesLabel}"></button></like-button-view-model>
    <button aria-label="${post.commentsLabel}"></button>
  </${tag}>`;
}

export function documentHtml(content) {
  return `<!doctype html><html lang="en"><head><title>Synthetic Shorts fixture</title></head>
    <body>${content}</body></html>`;
}
