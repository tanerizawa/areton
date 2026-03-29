export type UserRole = 'CLIENT' | 'ESCORT' | 'ADMIN' | 'SUPER_ADMIN';
export type EscortTier = 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED';
export type ServiceType = 'MEETING' | 'DINNER' | 'EVENT' | 'BUSINESS_ASSISTANT';
export type PaymentStatus = 'PENDING' | 'ESCROW' | 'RELEASED' | 'REFUNDED' | 'FAILED';
export type PaymentMethod = 'CRYPTO' | 'CRYPTO_USDT' | 'CRYPTO_ETH' | 'CRYPTO_BTC' | 'CRYPTO_SOL' | 'CRYPTO_XRP' | 'DOKU' | 'DOKU_VA' | 'DOKU_EWALLET' | 'DOKU_QRIS' | 'DOKU_CC' | 'DOKU_RETAIL' | 'VIRTUAL_ACCOUNT' | 'E_WALLET' | 'CREDIT_CARD' | 'BANK_TRANSFER';
export type MessageType = 'TEXT' | 'IMAGE' | 'SYSTEM';

export interface User {
  id: string;
  email: string;
  phone?: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isVerified: boolean;
  isActive: boolean;
  profilePhoto?: string;
  twoFactorEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EscortProfile {
  id: string;
  userId: string;
  user?: User;
  tier: EscortTier;
  languages: string[];
  skills: string[];
  hourlyRate: number;
  ratingAvg: number;
  totalBookings: number;
  totalReviews: number;
  bio?: string;
  portfolioUrls: string[];
  videoIntroUrl?: string;
  isApproved: boolean;
  createdAt: string;
}

export interface EscortListItem {
  id: string;
  userId: string;
  tier: EscortTier;
  hourlyRate: number;
  ratingAvg: number;
  totalBookings: number;
  languages: string[];
  skills: string[];
  bio?: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    profilePhoto?: string;
  };
}

export interface Booking {
  id: string;
  clientId: string;
  escortId: string;
  serviceType: ServiceType;
  status: BookingStatus;
  startTime: string;
  endTime: string;
  location: string;
  locationLat?: number;
  locationLng?: number;
  specialRequests?: string;
  totalAmount: number;
  checkinAt?: string;
  checkoutAt?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
  client?: { id: string; firstName: string; lastName: string; profilePhoto?: string };
  escort?: { id: string; firstName: string; lastName: string; profilePhoto?: string };
  payment?: Payment;
}

export interface Payment {
  id: string;
  bookingId: string;
  amount: number;
  method: string;
  status: PaymentStatus;
  platformFee: number;
  escortPayout: number;
  tipAmount?: number;
  paymentGatewayRef?: string;
  paidAt?: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  bookingId: string;
  senderId: string;
  content: string;
  type: MessageType;
  readAt?: string;
  createdAt: string;
}

export interface ChatRoom {
  bookingId: string;
  lastMessage?: ChatMessage;
  unreadCount: number;
  participant: {
    id: string;
    firstName: string;
    lastName: string;
    profilePhoto?: string;
    isOnline?: boolean;
  };
}

export interface Review {
  id: string;
  bookingId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment?: string;
  attitudeScore?: number;
  punctualityScore?: number;
  professionalismScore?: number;
  replyComment?: string;
  repliedAt?: string;
  createdAt: string;
  reviewer?: { id: string; firstName: string; lastName: string; profilePhoto?: string };
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: 'BOOKING' | 'PAYMENT' | 'CHAT' | 'SAFETY' | 'SYSTEM';
  data?: Record<string, any>;
  isRead: boolean;
  createdAt: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface EscortSearchParams {
  page?: number;
  limit?: number;
  search?: string;
  tier?: EscortTier;
  minRate?: number;
  maxRate?: number;
  language?: string;
  skill?: string;
  sortBy?: 'ratingAvg' | 'hourlyRate' | 'totalBookings';
  sortOrder?: 'asc' | 'desc';
}

export interface CreateBookingRequest {
  escortId: string;
  serviceType: ServiceType;
  startTime: string;
  endTime: string;
  location: string;
  locationLat?: number;
  locationLng?: number;
  specialRequests?: string;
}

export interface CreatePaymentRequest {
  bookingId: string;
  method: PaymentMethod;
}

export interface CreateReviewRequest {
  bookingId: string;
  rating: number;
  comment?: string;
  attitudeScore?: number;
  punctualityScore?: number;
  professionalismScore?: number;
}

export interface EarningsSummary {
  totalEarnings: number;
  pendingPayout: number;
  totalBookings: number;
  averageRating: number;
  thisMonth: number;
  lastMonth: number;
}

export interface IncidentReport {
  id: string;
  bookingId: string;
  reporterId: string;
  type: 'SOS' | 'COMPLAINT' | 'FEEDBACK';
  description: string;
  severity: number;
  resolutionStatus: string;
  createdAt: string;
}
