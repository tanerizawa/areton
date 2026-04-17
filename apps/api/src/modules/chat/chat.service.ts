import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/config/prisma.service';
import { EncryptionService } from '@/common/services/encryption.service';
import { SendMessageDto } from './dto/chat.dto';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async listRooms(userId: string) {
    // Chat rooms = bookings with status that allows chat
    const bookings = await this.prisma.booking.findMany({
      where: {
        OR: [{ clientId: userId }, { escortId: userId }],
        status: { in: ['CONFIRMED', 'ONGOING'] },
      },
      select: {
        id: true,
        serviceType: true,
        startTime: true,
        status: true,
        client: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
        escort: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            profilePhoto: true,
            escortProfile: { select: { tier: true } },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { content: true, createdAt: true, senderId: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Count unread messages per room
    const rooms = await Promise.all(
      bookings.map(async (booking) => {
        const unreadCount = await this.prisma.chatMessage.count({
          where: {
            bookingId: booking.id,
            senderId: { not: userId },
            readAt: null,
          },
        });

        return {
          bookingId: booking.id,
          serviceType: booking.serviceType,
          startTime: booking.startTime,
          status: booking.status,
          otherUser: booking.client.id === userId ? booking.escort : booking.client,
          lastMessage: booking.messages[0]
            ? { ...booking.messages[0], content: this.decryptSafe(booking.messages[0].content) }
            : null,
          unreadCount,
        };
      }),
    );

    return rooms;
  }

  async getMessages(userId: string, bookingId: string, rawPage = 1, rawLimit = 50) {
    const page = Math.max(1, Number(rawPage) || 1);
    const limit = Math.max(1, Math.min(100, Number(rawLimit) || 50));

    // Verify user is part of booking
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        client: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
        escort: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
      },
    });

    if (!booking) throw new NotFoundException('Booking tidak ditemukan');
    if (booking.clientId !== userId && booking.escortId !== userId) {
      throw new ForbiddenException('Anda tidak memiliki akses ke chat ini');
    }

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: { bookingId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: { select: { id: true, firstName: true, profilePhoto: true } },
        },
      }),
      this.prisma.chatMessage.count({ where: { bookingId } }),
    ]);

    // Decrypt message contents
    const decryptedMessages = messages.map((msg) => ({
      ...msg,
      content: this.decryptSafe(msg.content),
    }));

    const otherUser = booking.clientId === userId ? booking.escort : booking.client;

    return {
      messages: decryptedMessages.reverse(), // chronological order
      otherUser,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async sendMessage(senderId: string, dto: SendMessageDto) {
    const bookingId = dto.bookingId;
    if (!bookingId) throw new BadRequestException('bookingId is required');

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) throw new NotFoundException('Booking tidak ditemukan');
    if (booking.clientId !== senderId && booking.escortId !== senderId) {
      throw new ForbiddenException('Anda tidak memiliki akses ke chat ini');
    }

    if (!['CONFIRMED', 'ONGOING'].includes(booking.status)) {
      throw new ForbiddenException('Chat hanya tersedia untuk booking yang aktif');
    }

    const content = typeof dto.content === 'string' ? dto.content.trim() : '';
    if (!content) {
      throw new BadRequestException('Pesan tidak boleh kosong');
    }
    if (content.length > 4000) {
      throw new BadRequestException('Pesan terlalu panjang (maks 4000 karakter)');
    }

    // Encrypt message content at rest using AES-256-GCM.
    const encryptedContent = this.encryption.encrypt(content);

    const message = await this.prisma.chatMessage.create({
      data: {
        bookingId,
        senderId,
        content: encryptedContent,
        type: dto.type || 'TEXT',
      },
      include: {
        sender: { select: { id: true, firstName: true, profilePhoto: true } },
      },
    });

    // Return decrypted content for real-time delivery
    return {
      ...message,
      content,
    };
  }

  async markAsRead(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) throw new NotFoundException('Booking tidak ditemukan');
    if (booking.clientId !== userId && booking.escortId !== userId) {
      throw new ForbiddenException('Akses ditolak');
    }

    const result = await this.prisma.chatMessage.updateMany({
      where: {
        bookingId,
        senderId: { not: userId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return { markedAsRead: result.count };
  }

  /**
   * Safely decrypt content — returns original if decryption fails (for pre-encryption messages)
   */
  private decryptSafe(content: string): string {
    try {
      return this.encryption.decrypt(content);
    } catch {
      return content; // Return as-is if not encrypted
    }
  }
}
