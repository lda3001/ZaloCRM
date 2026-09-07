// Run against a local production preview; all API data is synthetic.
// NODE_PATH may point to a bundled Playwright installation.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'zalocrm-mobile-'));
  const contact = { id: 'contact-test', fullName: 'Khách hàng kiểm tra mobile', phone: '0900000000', tags: [], status: 'new' };
  const account = { id: 'account-test', displayName: 'Zalo kiểm tra' };
  const conversation = { id: 'conversation-test', threadType: 'user', contact, zaloAccount: account, unreadCount: 3, isReplied: false };
  const group = { ...conversation, id: 'group-test', threadType: 'group', contact: { ...contact, fullName: 'Nhóm kiểm tra mobile' } };
  const messages = Array.from({ length: 24 }, (_, i) => ({ id: `message-${i}`, content: i === 23 ? 'https://example.com/' + 'long'.repeat(55) : `Tin nhắn kiểm tra ${i}`, contentType: 'text', senderType: i % 2 ? 'contact' : 'self', senderName: 'Khách hàng', sentAt: '2026-09-07T09:00:00Z' }));
  try {
    for (const width of [320, 375, 390, 430, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768 });
      await context.addInitScript(() => { localStorage.setItem('token', 'mobile-test-only'); localStorage.setItem('theme', 'light'); });
      await context.route('**/socket.io/**', route => route.abort());
      await context.route('**/api/**', route => {
        const url = new URL(route.request().url());
        const endpoint = url.pathname.replace('/api/v1', '');
        let data = {};
        if (endpoint === '/profile') data = { id: 'test', email: 'test@example.invalid', fullName: 'Kiểm tra', role: 'owner', orgId: 'test' };
        else if (endpoint === '/conversations') data = { conversations: [conversation, group], total: 2 };
        else if (endpoint.endsWith('/messages')) data = { messages, total: messages.length };
        else if (endpoint === '/conversations/conversation-test') data = conversation;
        else if (endpoint === '/conversations/group-test') data = group;
        else if (endpoint.endsWith('/group-info')) data = { group: { id: 'group-test', name: 'Nhóm kiểm tra mobile', members: [], memberCount: 0 } };
        else if (endpoint.endsWith('/mute')) data = { muted: false };
        else if (endpoint === '/zalo-accounts') data = { accounts: [account] };
        else if (endpoint === '/conversations/unreplied-count') data = { unrepliedCount: 3 };
        else if (endpoint === '/contacts') data = { contacts: [contact], total: 1 };
        else if (endpoint === '/contacts/contact-test') data = contact;
        else if (endpoint === '/orders/stats') data = { totalOrders: 1234, totalRevenue: 1234567890, todayRevenue: 987654321 };
        else if (endpoint === '/orders') data = { orders: [{ id: 'order-test', orderCode: 'DH0001', contact, totalAmount: 12345678, status: 'new', createdAt: '2026-09-07' }], total: 1 };
        else if (endpoint.endsWith('/appointments')) data = { appointments: [] };
        else if (endpoint === '/users') data = { users: [] };
        else if (endpoint === '/teams') data = { teams: [] };
        else if (endpoint === '/search') data = { contacts: [contact], messages: [], appointments: [] };
        return route.fulfill({ json: data });
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const fits = async label => {
        const sizes = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
        assert.ok(sizes.scroll <= sizes.width + 1, `${width}px ${label}: page overflow ${JSON.stringify(sizes)}`);
      };
      await page.goto('http://127.0.0.1:4173/chat');
      await page.getByText(contact.fullName, { exact: true }).first().click();
      await page.locator('#chat-message-input').waitFor();
      await fits('chat');
      const composer = await page.locator('.chat-toolbar--composer').boundingBox();
      const input = await page.locator('#chat-message-input').boundingBox();
      assert.ok(composer.y + composer.height <= 845, `${width}px composer below viewport`);
      if (width < 768) {
        assert.ok(input.width > width - 60, `${width}px composer input too narrow`);
        await page.getByRole('button', { name: 'Chèn biểu tượng cảm xúc', exact: true }).click();
        await fits('emoji');
        const pickerFits = await page.locator('.chat-picker').evaluate(el => el.scrollWidth <= el.clientWidth + 1);
        assert.ok(pickerFits, `${width}px emoji overflow`);
        await page.screenshot({ path: path.join(output, `chat-emoji-${width}.png`) });
        await page.getByRole('button', { name: 'Chèn biểu tượng cảm xúc', exact: true }).click();
        await page.getByRole('button', { name: 'Xem thông tin khách hàng', exact: true }).click();
        await page.getByRole('dialog').waitFor();
        await page.getByRole('button', { name: 'Đóng', exact: true }).click();
        await page.getByRole('button', { name: 'Quay lại danh sách', exact: true }).click();
        await page.getByText(group.contact.fullName, { exact: true }).first().click();
        await page.getByRole('button', { name: 'Xem thông tin nhóm', exact: true }).last().click();
        await page.getByRole('dialog').waitFor();
        await page.getByRole('button', { name: 'Đóng', exact: true }).click();
        await page.setViewportSize({ width, height: 440 });
        await page.waitForTimeout(150);
        const compactComposer = await page.locator('.chat-toolbar--composer').boundingBox();
        assert.ok(compactComposer.y + compactComposer.height <= 441, 'Reduced viewport hides composer');
        await page.setViewportSize({ width, height: 844 });
        await page.getByRole('button', { name: 'Mở menu điều hướng', exact: true }).click();
        await page.getByRole('dialog').waitFor();
        await page.waitForTimeout(350);
        await page.screenshot({ path: path.join(output, `menu-${width}.png`) });
        await page.getByRole('dialog').getByRole('textbox', { name: 'Tìm kiếm', exact: true }).fill('mobile');
        await page.getByRole('dialog').getByRole('button', { name: contact.fullName }).click();
        await page.getByRole('dialog').getByRole('button', { name: /close/i }).click();
        // The search result opens the contact dialog and closes the menu.
        await page.getByText('Thêm KH', { exact: true }).waitFor();
        await page.getByRole('dialog').waitFor({ state: 'detached' });
        await fits('contacts');
      }
      await page.goto('http://127.0.0.1:4173/orders');
      await page.getByText('DH0001', { exact: true }).waitFor();
      await fits('orders');
      if (width < 768) {
        const tableScroll = await page.locator('table').first().evaluate(table => {
          let el = table.parentElement;
          while (el && el !== document.body) {
            if (['auto', 'scroll'].includes(getComputedStyle(el).overflowX)) {
              el.scrollLeft = 200;
              if (el.scrollLeft > 0) return el.scrollLeft;
            }
            el = el.parentElement;
          }
          return 0;
        });
        assert.ok(tableScroll > 0, 'Order table cannot be swiped horizontally');
      }
      await page.screenshot({ path: path.join(output, `orders-${width}.png`) });
      assert.deepEqual(errors, [], `${width}px browser errors`);
      console.log(`PASS ${width}px: chat, navigation, details, composer, tables`);
      await context.close();
    }
    console.log(`Screenshots: ${output}`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
