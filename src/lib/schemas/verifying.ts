import mongoose from 'mongoose';

export interface Verifying {
  userId: string;
  mainRoomId: string;
  verificationRoomId?: string;
  captchaAnswer?: string;
}

const schema = new mongoose.Schema<Verifying>({
  userId: {
    type: String,
    required: true
  },
  mainRoomId: {
    type: String,
    required: true
  },
  verificationRoomId: {
    type: String,
    unique: true
  },
  captchaAnswer: {
    type: String
  }
});

export const model = mongoose.model<Verifying>('verifyingData', schema);
