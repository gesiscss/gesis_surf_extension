import { baseline, documentHtml, fixtureUrl, message } from './chatgpt-fixtures.mjs';
import { captureAssertions, equalAssertion } from './report.mjs';
import { runScenario } from './browser-harness.mjs';
import { runBaseline } from './baseline-harness.mjs';

const user = { role: 'user', id: 'synthetic-user', text: 'Synthetic greeting' };
const assistant = { role: 'assistant', id: 'synthetic-assistant', text: 'Synthetic response' };

function expectedMessage(item, turnIndex) {
  return {
    llm_provider: 'chatgpt',
    message_type: item.role === 'user' ? 'user_question' : 'ai_response',
    message_content: item.text,
    message_id: item.id,
    turn_index: turnIndex,
    chat_session_id: 'synthetic-conversation',
    url: fixtureUrl,
    page_title: 'Synthetic conversation',
  };
}

await runBaseline({
  provider: 'chatgpt',
  reportFile: './report-chatgpt.json',
  selectorFile: './chatgpt-selectors.json',
  entry: './chatgpt-entry.ts',
  bundleName: 'ChatGPTProbe',
  baseline,
  async run({ browser, bundle, snapshot, report }) {
    const scenario = async (id, content, config, initialTime, check) => {
      report.scenarios.push(
        await runScenario({
          browser,
          id,
          url: fixtureUrl,
          html: documentHtml(content),
          config,
          bundle,
          probeName: 'chatgptProbe',
          initialTime,
          check,
        }),
      );
    };

    await scenario(
      'existing_conversation',
      message(user.role, user.id, user.text) + message(assistant.role, assistant.id, assistant.text),
      snapshot.base,
      2000,
      events => captureAssertions(events, [expectedMessage(user, 1), expectedMessage(assistant, 2)]),
    );

    const alternateConfig = {
      ...snapshot.base,
      selectors: { ...snapshot.base.selectors, ...snapshot.alternateRole },
    };
    await scenario(
      'alternate_role_attribute',
      message(user.role, user.id, user.text, 'data-message-role'),
      alternateConfig,
      2000,
      async (events, page) => {
        const fixture = page.locator('[data-message-role="user"]');
        return [
          equalAssertion('fixture_user_present', 1, await fixture.count()),
          equalAssertion('fixture_user_visible', true, await fixture.isVisible()),
          ...captureAssertions(events, [expectedMessage(user, 1)]),
        ];
      },
    );

    await scenario(
      'assistant_streaming',
      message(assistant.role, assistant.id, ''),
      snapshot.base,
      0,
      async (initial, page, captures) => {
        const assertions = [equalAssertion('initial.capture_count', 0, initial.length)];
        await page.locator('.whitespace-pre-wrap').evaluate(element => {
          element.textContent = 'Synthetic ';
        });
        await page.clock.runFor(1000);
        assertions.push(equalAssertion('before_final_chunk.capture_count', 0, (await captures()).length));
        await page.locator('.whitespace-pre-wrap').evaluate(element => {
          element.textContent = 'Synthetic response';
        });
        await page.clock.runFor(1000);
        assertions.push(equalAssertion('before_debounce.capture_count', 0, (await captures()).length));
        await page.clock.runFor(600);
        assertions.push(...captureAssertions(await captures(), [expectedMessage(assistant, 1)]));
        await page.clock.runFor(2500);
        assertions.push(equalAssertion('after_settling.capture_count', 1, (await captures()).length));
        return assertions;
      },
    );
  },
});
