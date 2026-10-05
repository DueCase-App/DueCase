export type ParentRole = 'father' | 'mother';
export type FamilyInfo = { id: string; name: string | null; inviteCode: string | null; };

export type RegistrationChildInput = {
  displayName: string;
  birthDate?: string | null;
};

export type RegisterInput = {
  displayName: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  taxCode: string;
  email: string;
  phone: string;
  password: string;
  role: ParentRole;
  familyName: string;
  children: RegistrationChildInput[];
  inviteOtherParent: boolean;
};

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  taxCode: string | null;
  phone: string | null;
  role: ParentRole;
  familyId: string | null;
  family: FamilyInfo | null;
};

export type AuthResponse = { token: string; user: AuthUser; };
export type FamilyActionResponse = { family: FamilyInfo; memberCount: number; };
export type FamilyChild = { id: string; displayName: string; birthDate: string | null; };
export type DailyCustody = { id: string; familyId: string; custodyDate: string; custodianRole: ParentRole; parentId: string | null; notes: string | null; createdAt: string; updatedAt: string; };
export type SwapRequestStatus = 'pending' | 'approved' | 'rejected';
export type SwapRequest = { id: string; familyId: string; requestedBy: string; requestedByName: string; requestedByRole: ParentRole; targetDate: string; proposedDate: string; status: SwapRequestStatus; notes: string | null; reviewedBy: string | null; reviewedAt: string | null; createdAt: string; updatedAt: string; canRespond: boolean; };
export type ExpenseCategory = 'Scuola' | 'Salute' | 'Sport' | 'Svago';
export type ExpenseStatus = 'pending_approval' | 'approved' | 'declined';
export type Expense = { id: string; familyId: string; title: string; amount: string; category: ExpenseCategory; paidByUserId: string; paidByName: string | null; paidByRole: ParentRole | null; receiptUrl: string | null; status: ExpenseStatus; expenseDate: string; notes: string | null; reviewedByUserId: string | null; reviewedAt: string | null; approvalOtpVerifiedAt?: string | null; createdAt: string; updatedAt: string; canReview: boolean; };
export type FamilyBalance = { fatherPaid: string; motherPaid: string; totalApproved: string; perParentShare: string; settlementAmount: string; creditorRole: ParentRole | null; debtorRole: ParentRole | null; currentUserRole: ParentRole; direction: 'receive' | 'pay' | 'settled'; };
export type DocumentCategory = 'Salute' | 'Scuola' | 'Legale' | 'Altro';
export type FamilyDocument = { id: string; familyId: string; title: string; description: string | null; fileUrl: string; uploadedByUserId: string | null; uploadedByName: string | null; uploadedByRole: ParentRole | null; category: DocumentCategory; mimeType: string | null; filename: string | null; fileSizeBytes: number | null; createdAt: string; updatedAt: string; };
export type FamilyEvent = { id: string; familyId: string; title: string; startsAt: string; endsAt: string | null; location: string | null; notes: string | null; createdByUserId: string | null; createdAt: string; updatedAt: string; };
