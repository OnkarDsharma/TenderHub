/**
 * @file backend/src/scripts/testWhatsAppAlert.js
 * @description Quick CLI test script to verify AiSensy WhatsApp integration.
 * Usage: node src/scripts/testWhatsAppAlert.js <10-digit-phone-number>
 */
import dotenv from 'dotenv';
dotenv.config();

import { aiSensyWhatsAppAdapter } from '../modules/notifications/adapters/AiSensyWhatsAppAdapter.js';

async function main() {
  const phone = process.argv[2];

  if (!phone) {
    console.error('\n❌ Please provide a phone number to test.');
    console.error('👉 Usage: node src/scripts/testWhatsAppAlert.js 9876543210\n');
    process.exit(1);
  }

  console.log(`\n==================================================`);
  console.log(`🚀 Testing AiSensy WhatsApp Notification`);
  console.log(`==================================================`);
  console.log(`Target Phone:      ${phone}`);
  console.log(`AiSensy API Key:   ${process.env.AISENSY_API_KEY ? 'Configured ✅' : 'Missing ❌ (will run in Mock Mode)'}`);
  console.log(`Campaign Name:     ${process.env.AISENSY_CAMPAIGN_NAME || 'Not set'}`);
  console.log(`==================================================\n`);

  const sampleTender = {
    _id: 'sample_tender_123',
    title: 'Construction of 2-Lane Road and Drainage Network in Srinagar',
    department: 'PW(R&B) Department, J&K',
    tenderValueFormatted: '₹1,45,00,000',
    closingDateFormatted: '28 Oct 2026, 04:00 PM'
  };

  const sampleUser = {
    name: 'Test Contractor',
    weeklyQuotaFooter: '⚡ Test Message from TenderHub J&K Engine'
  };

  try {
    console.log('⏳ Dispatching tender alert...');
    const result = await aiSensyWhatsAppAdapter.sendTenderAlert({
      phone,
      tender: sampleTender,
      user: sampleUser
    });

    console.log('\n✅ Result:', result);
    if (result.isMock) {
      console.log('⚠️ Note: Ran in MOCK MODE because valid live credentials were not loaded or isMock was triggered.');
    } else {
      console.log('🎉 Message dispatched successfully to AiSensy API! Check your phone.');
    }
  } catch (error) {
    console.error('\n❌ Failed to dispatch message:', error.message);
  }
}

main();
