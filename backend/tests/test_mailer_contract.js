const assert = require('node:assert/strict');
const test = require('node:test');
const nodemailer = require('nodemailer');
const fs = require('node:fs');

process.env.SMTP_HOST = 'smtp.test.invalid';
process.env.SMTP_USER = 'sender@example.test';
process.env.SMTP_PASS = 'not-a-real-password';
process.env.SMTP_TEST_MODE = 'false';
fs.writeFileSync = () => {};

const sentMessages = [];
nodemailer.createTransport = () => ({
  async sendMail(message) {
    sentMessages.push(message);
    if (message.to === 'sms-fails@example.test') throw new Error('simulated gateway failure');
    return { messageId: `test-${sentMessages.length}` };
  },
});

const { sendAlert } = require('../notify_mailer');

test('alert mailer refuses delivery without explicit SMTP settings', async () => {
  const saved = [process.env.SMTP_HOST, process.env.SMTP_USER, process.env.SMTP_PASS];
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  try {
    const result = await sendAlert({ admin_email: 'technician@example.test' });
    assert.equal(result.status, 'error');
    assert.match(result.message, /Alert delivery is disabled/);
    assert.equal(sentMessages.length, 0);
  } finally {
    [process.env.SMTP_HOST, process.env.SMTP_USER, process.env.SMTP_PASS] = saved;
  }
});

test('alert mailer sends email and reports optional SMS channel accurately', async () => {
  sentMessages.length = 0;
  const result = await sendAlert({
    machine_id: 'CNC-01',
    health_score: 35,
    health_status: 'CRITICAL',
    diagnosed_fault: 'Bearing Spall',
    confidence_pct: 91,
    admin_email: 'technician@example.test',
    admin_phone_email: 'sms@example.test',
  });

  assert.equal(result.status, 'success');
  assert.equal(result.channels.email, 'sent');
  assert.equal(result.channels.sms, 'sent');
  assert.equal(sentMessages.length, 2);
  assert.equal(sentMessages[0].to, 'technician@example.test');
  assert.equal(sentMessages[1].to, 'sms@example.test');
});

test('alert mailer reports SMS failure without claiming SMS was sent', async () => {
  sentMessages.length = 0;
  const result = await sendAlert({
    machine_id: 'CNC-01',
    admin_email: 'technician@example.test',
    admin_phone_email: 'sms-fails@example.test',
  });

  assert.equal(result.status, 'success');
  assert.equal(result.channels.email, 'sent');
  assert.equal(result.channels.sms, 'failed');
  assert.equal(result.message_ids.sms, null);
});
