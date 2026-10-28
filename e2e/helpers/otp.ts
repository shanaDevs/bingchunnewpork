import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('94') && digits.length === 11) return `0${digits.slice(2)}`;
  if (digits.startsWith('7') && digits.length === 9) return `0${digits}`;
  if (digits.startsWith('07') && digits.length === 10) return digits;
  return phone.trim();
}

/** Read the latest unused OTP from the database (e2e only — not exposed in API responses). */
export async function getLatestOtpForPhone(rawPhone: string): Promise<string> {
  const phone = normalizePhone(rawPhone);
  const user = await prisma.user.findFirst({
    where: { phone },
    select: { id: true },
  });
  if (!user) throw new Error(`No user found for phone ${phone}`);

  const otp = await prisma.otpRecord.findFirst({
    where: { userId: user.id, phone, used: false },
    orderBy: { createdAt: 'desc' },
    select: { code: true },
  });
  if (!otp?.code) throw new Error(`No OTP found for phone ${phone}`);
  return otp.code;
}

export async function disconnectOtpDb() {
  await prisma.$disconnect();
}
