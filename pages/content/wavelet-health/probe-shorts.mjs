import { baseline, documentHtml, firstPost, fixtureUrl, overlay, secondPost } from './fixtures.mjs';
import { captureAssertions, equalAssertion } from './report.mjs';
import { runScenario } from './browser-harness.mjs';
import { runBaseline } from './baseline-harness.mjs';

function expectedPost(post, likes, comments) {
  return {
    id: post.id,
    platform: 'youtube_shorts',
    signal_type: 'feed',
    content_text: post.title,
    channel_handle: post.channel,
    author_handle: post.channel,
    likes,
    comments,
    page_url: `https://www.youtube.com/shorts/${post.id}`,
    permalink: `https://www.youtube.com/shorts/${post.id}`,
  };
}

await runBaseline({
  provider: 'youtube_shorts',
  reportFile: './report.json',
  selectorFile: './selectors.json',
  entry: './shorts-entry.ts',
  bundleName: 'ShortsProbe',
  baseline,
  async run({ browser, bundle, snapshot, report }) {
    const scenario = async (id, content, check) => {
      report.scenarios.push(
        await runScenario({
          browser,
          id,
          url: fixtureUrl,
          html: documentHtml(content),
          config: snapshot,
          bundle,
          probeName: 'shortsProbe',
          initialTime: 2500,
          check,
        }),
      );
    };

    await scenario('direct_landing', overlay(firstPost), events =>
      captureAssertions(events, [expectedPost(firstPost, 1234, 12)]),
    );
    await scenario('navigation_and_duplicates', overlay(firstPost), async (initial, page, captures) => {
      const assertions = captureAssertions(initial, [expectedPost(firstPost, 1234, 12)]).map(assertion => ({
        ...assertion,
        name: `initial.${assertion.name}`,
      }));
      await page.evaluate(html => {
        history.pushState(null, '', '/shorts/fixture-second');
        document.body.innerHTML = html;
        window.dispatchEvent(new Event('yt-navigate-finish'));
      }, overlay(secondPost));
      await page.clock.runFor(500);
      assertions.push(
        ...captureAssertions(await captures(), [expectedPost(firstPost, 1234, 12), expectedPost(secondPost, 0, 0)]),
      );
      await page.evaluate(() => window.dispatchEvent(new Event('yt-navigate-finish')));
      await page.clock.runFor(2500);
      assertions.push(equalAssertion('captures_after_duplicate_navigation', 2, (await captures()).length));
      return assertions;
    });
    await scenario('changed_overlay', overlay(firstPost, 'new-shorts-overlay'), events =>
      captureAssertions(events, [expectedPost(firstPost, 1234, 12)]),
    );
    await scenario('abbreviated_likes', overlay({ ...firstPost, likesLabel: '46k likes' }), events => {
      const assertions = [equalAssertion('capture_count', 1, events.length)];
      if (events.length === 1) {
        assertions.push({
          name: 'likes',
          expected: { operator: 'greater_than', value: 0 },
          observed: events[0].likes ?? null,
          passed: typeof events[0].likes === 'number' && events[0].likes > 0,
        });
      }
      return assertions;
    });
  },
});
