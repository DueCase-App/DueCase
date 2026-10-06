export type ParentRole = 'father' | 'mother';
export type FamilyInfo = { id: string; name: string | null; inviteCode: string | null; };

export type RegistrationChildInput = { displayName: string; birthDate?: string | null; };
export type RegisterInput = { displayName: string; firstName: string; lastName: string; birthDate: string; taxCode: string; email: string; phone: string; password: string; role: ParentRole; familyName: string; children: RegistrationChildInput[]; inviteOtherParent: boolean; };
export type AuthUser = { id: string; email: string; displayName: string; firstName: string | null; lastName: string | null; birthDate: string | null; taxCode: string | null; phone: string | null; role: ParentRole; familyId: string | null; family: FamilyInfo | null; };
export type AuthResponse = { token: string; user: AuthUser; };
export type FamilyActionResponse = { family: FamilyInfo; memberCount: number; };

export type FamilyChild = { id: string; familyId?: string; displayName: string; birthDate: string | null; school?: string | null; className?: string | null; sports?: string | null; extracurricular?: string | null; usefulInfo?: string | null; authorizations?: string | null; sharedNotes?: string | null; createdAt?: string; updatedAt?: string; };
export type FamilyChildInput = Omit<FamilyChild, 'id' | 'familyId' | 'createdAt' | 'updatedAt'>;

export type DailyCustody = { id: string; familyId: string; custodyDate: string; custodianRole: ParentRole; parentId: string | null; notes: string | null; createdAt: string; updatedAt: string; };
export type CustodyCurrentChild = { childId: string; childName: string; custodianRole: ParentRole | null; overnight: boolean; notes: string | null; source: 'exception' | 'calendar' | 'weekly_pattern' | 'undefined'; };
export type CustodyCurrent = { date: string; children: CustodyCurrentChild[]; };
export type CustodyPattern = { id: string; childId: string; childName?: string; weekday: number; custodianRole: ParentRole; overnight: boolean; notes: string | null; createdAt: string; updatedAt: string; };
export type CustodyException = { id: string; childId: string; childName?: string; custodyDate: string; custodianRole: ParentRole; overnight: boolean; notes: string | null; requestedBy: string; requestedByName?: string; requestedByRole?: ParentRole; status: 'pending' | 'approved' | 'rejected'; reviewedBy?: string | null; reviewedAt?: string | null; createdAt: string; updatedAt: string; canRespond: boolean; };

export type SwapRequestStatus = 'pending' | 'approved' | 'rejected';
export type SwapRequest = { id: string; familyId: string; requestedBy: string; requestedByName: string; requestedByRole: ParentRole; targetDate: string; proposedDate: string; status: SwapRequestStatus; notes: string | null; reviewedBy: string | null; reviewedAt: string | null; createdAt: string; updatedAt: string; canRespond: boolean; };

export type ExpenseCategory = 'Scuola' | 'Salute' | 'Sport' | 'Svago';
export type ExpenseStatus = 'draft' | 'submitted' | 'pending_approval' | 'approved' | 'declined' | 'disputed' | 'to_pay' | 'partially_paid' | 'paid' | 'closed';
export type OtpSignatureMetadata = { version: number; verifiedAt: string; date: string; time: string; ipAddress: string; otpHash: string; hashAlgorithm: 'HMAC-SHA-256' | string; otpRequestId: string; signerUserId: string; userAgent: string | null; };
export type ExpenseChildRef = { id: string; displayName: string; };
export type Expense = { id: string; familyId: string; title: string; amount: string; category: ExpenseCategory; paidByUserId: string; paidByName: string | null; paidByRole: ParentRole | null; receiptUrl: string | null; status: ExpenseStatus; expenseDate: string; notes: string | null; isExtraordinary: boolean; otpSignatureMetadata: OtpSignatureMetadata | null; fatherPercentage: string | number; motherPercentage: string | number; childIds: string[]; children: ExpenseChildRef[]; reviewedByUserId: string | null; reviewedAt: string | null; approvalOtpVerifiedAt?: string | null; createdAt: string; updatedAt: string; canReview: boolean; };
export type FamilyBalance = { fatherPaid: string; motherPaid: string; totalApproved: string; fatherShare: string; motherShare: string; perParentShare: string | null; settlementAmount: string; creditorRole: ParentRole | null; debtorRole: ParentRole | null; currentUserRole: ParentRole; direction: 'receive' | 'pay' | 'settled'; };
export type ExpensePayment = { id: string; expenseId: string; paidByUserId: string; paidByName?: string | null; paidByRole?: ParentRole | null; amount: string; status: 'declared' | 'confirmed' | 'rejected'; paidAt: string; receiptFilename?: string | null; receiptMimeType?: string | null; receiptUrl?: string | null; notes?: string | null; confirmedByUserId?: string | null; confirmedAt?: string | null; createdAt?: string; canConfirm: boolean; };

export type DocumentCategory = 'Salute' | 'Scuola' | 'Legale' | 'Altro';
export type DocumentChildRef = { id: string; displayName: string; };
export type FamilyDocument = { id: string; familyId: string; title: string; description: string | null; fileUrl: string; uploadedByUserId: string | null; uploadedByName: string | null; uploadedByRole: ParentRole | null; category: DocumentCategory; mimeType: string | null; filename: string | null; fileSizeBytes: number | null; childIds: string[]; children: DocumentChildRef[]; createdAt: string; updatedAt: string; };

export type FamilyEventType = 'custody' | 'overnight' | 'holiday' | 'vacation' | 'school' | 'sport' | 'medical' | 'birthday' | 'appointment' | 'personal' | 'other';
export type FamilyEventStatus = 'pending' | 'confirmed' | 'rejected';
export type FamilyEvent = {
  id: string;
  familyId: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  notes: string | null;
  childId: string | null;
  childName?: string | null;
  eventType: FamilyEventType;
  status: FamilyEventStatus;
  requiresApproval: boolean;
  createdByUserId: string | null;
  createdByName?: string | null;
  createdByRole?: ParentRole | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  responseNote?: string | null;
  createdAt: string;
  updatedAt: string;
  canRespond?: boolean;
};

export type AgreementCategory = 'calendar' | 'vacation' | 'expense' | 'school' | 'sport' | 'medical' | 'organization' | 'other';
export type AgreementStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested';
export type FamilyAgreement = { id: string; familyId: string; createdBy: string; createdByName?: string; createdByRole?: ParentRole; category: AgreementCategory; title: string; body: string; status: AgreementStatus; reviewedBy: string | null; reviewedByName?: string | null; reviewedByRole?: ParentRole | null; responseNote: string | null; reviewedAt: string | null; createdAt: string; updatedAt: string; canRespond: boolean; };
export type AgreementHistoryItem = { id: string; action: string; snapshot: unknown; createdAt: string; actorName: string | null; actorRole: ParentRole | null; };

export type MessageAttachment = { id: string; filename: string; mimeType: string; fileSizeBytes: number; dataHash: string; fileUrl: string; createdAt: string; };
export type LegalMessage = { id: string; familyId: string; senderId: string; senderName: string; senderRole: ParentRole | null; text: string; createdAt: string; readAt: string | null; dataHash: string; attachments: MessageAttachment[]; isMine: boolean; integrityVerified: true; };
export type ToneAnalysis = { aggressive: boolean; score: number; signals: string[]; reformulatedText: string | null; engine: string; };

export type ParentingTimeSlice = { role: ParentRole; label: 'Papà' | 'Mamma' | string; seconds: number; hours: number; percentage: number; };
export type ParentingTimeReport = { period: { from: string | null; to: string | null }; totalSeconds: number; totalHours: number; father: ParentingTimeSlice; mother: ParentingTimeSlice; chart: ParentingTimeSlice[]; source: string; };

export type FamilyActivity = {
  id: string;
  entityType: string;
  entityId: string | null;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
  actorUserId: string | null;
  actorName: string | null;
  actorRole: ParentRole | null;
};

export type InAppNotification = { id: string; type: string; title: string; body: string; entityType: string | null; entityId: string | null; readAt: string | null; createdAt: string; };
