import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Res,
  Req,
  Query,
  HttpStatus,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AiService, ChatMessage, StreamEvent } from './ai.service.js';
import { AuthService } from '../auth/auth.service.js';

interface ChatDto {
  message: string;
  history?: ChatMessage[];
}

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly authService: AuthService,
  ) {}

  @Get('status')
  getStatus() {
    return this.aiService.getStatus();
  }

  @Post('chat')
  async chat(
    @Body() body: ChatDto,
    @Res() res: Response,
    @Req() req: Request,
    @Query('userId') queryUserId?: string,
    @Headers('x-user-id') headerUserId?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    let userId: string;
    try {
      userId = await this.authService.resolveUserId(
        queryUserId || headerUserId,
        authHeader,
      );
    } catch {
      return res.status(HttpStatus.UNAUTHORIZED).json({
        error: 'Unauthorized',
        message: 'You must be signed in to use the AI Financial Copilot.',
      });
    }

    if (!body?.message?.trim()) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: 'Bad Request',
        message: 'Message cannot be empty.',
      });
    }

    // Set up Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    let isClosed = false;
    req.on('close', () => {
      isClosed = true;
    });

    const sendEvent = (event: StreamEvent) => {
      if (isClosed) return;
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await this.aiService.streamChat(
        userId,
        body.message,
        body.history || [],
        (event) => {
          sendEvent(event);
        },
      );
    } catch (err: any) {
      sendEvent({
        type: 'error',
        message: err?.message || 'Internal server error while processing prompt.',
      });
      sendEvent({ type: 'done' });
    } finally {
      if (!isClosed) {
        res.end();
      }
    }
  }
}
