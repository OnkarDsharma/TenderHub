import Waitlist from '../models/Waitlist.js';

const validPlans = new Set(['contractor_pro', 'bidding_pro_enterprise']);
const validClasses = new Set(['Class Special', 'Class A', 'Class B', 'Class C', 'Class D', 'Supplier/Other']);

export const joinWaitlist = async (req, res, next) => {
  try {
    const { name, phone, email, firmName, contractorClass, interestedPlan } = req.body || {};
    const cleanName = typeof name === 'string' ? name.trim() : '';
    const cleanPhone = typeof phone === 'string' ? phone.replace(/\D/g, '') : '';
    if (cleanName.length < 2 || cleanName.length > 120) {
      return res.status(400).json({ success: false, message: 'Enter a name between 2 and 120 characters.' });
    }
    if (!/^91\d{10}$/.test(cleanPhone)) {
      return res.status(400).json({ success: false, message: 'Enter a valid Indian mobile number with country code.' });
    }
    if (!validPlans.has(interestedPlan)) {
      return res.status(400).json({ success: false, message: 'Select a valid waitlist plan.' });
    }
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (cleanEmail && (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail))) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
    }
    const cleanFirm = typeof firmName === 'string' ? firmName.trim().slice(0, 160) : '';
    const cleanClass = validClasses.has(contractorClass) ? contractorClass : undefined;
    const update = {
      name: cleanName,
      interestedPlan,
      ...(cleanEmail ? { email: cleanEmail } : {}),
      ...(cleanFirm ? { firmName: cleanFirm } : {}),
      ...(cleanClass ? { contractorClass: cleanClass } : {}),
      ...(req.ip ? { ipAddress: req.ip } : {}),
    };

    await Waitlist.findOneAndUpdate({ phone: `+${cleanPhone}` }, { $set: update, $setOnInsert: { phone: `+${cleanPhone}` } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
    const waitlistCount = await Waitlist.countDocuments();
    return res.status(200).json({ success: true, message: 'Successfully joined waitlist', waitlistCount });
  } catch (error) {
    next(error);
  }
};
