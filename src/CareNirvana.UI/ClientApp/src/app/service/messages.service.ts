import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

// --- Models to match your API ---
export interface MessageDto {
  messageId: number;
  threadId: number;
  parentMessageId?: number | null;
  senderUserId: number;
  body: string;
  isDeleted: boolean;
  createdOn: string;
  editedOn?: string | null;
  replies?: MessageDto[];
}

export interface ThreadWithMessagesDto {
  threadId: number;
  user1Id: number;
  user2Id: number;
  memberDetailsId?: number | null;
  messages: MessageDto[];
}

export interface CreateMessageRequest {
  otherUserId: number;
  memberDetailsId?: number | null;
  parentMessageId?: number | null;
  body: string;
  createdUserId: number;
}

export interface UpdateMessageRequest {
  body: string;
  createdUserId: number;
}

@Injectable({
  providedIn: 'root'
})
export class MessagesService {

  private baseUrl = 'https://carenirvana-microservices-dfgda7g4fzhqckhj.eastus2-01.azurewebsites.net/api/message';
  //private baseUrl = 'https://localhost:7201/api/message';

  constructor(private http: HttpClient) { }

  // GET /api/message?userId=...&page=...&pageSize=...
  getByUser(userId: number, page = 1, pageSize = 50): Observable<ThreadWithMessagesDto[]> {
    let params = new HttpParams()
      .set('userId', String(userId))
      .set('page', String(page))
      .set('pageSize', String(pageSize));
    return this.http.get<ThreadWithMessagesDto[]>(`${this.baseUrl}`, { params });
  }

  // GET /api/message?memberDetailsId=...&page=...&pageSize=...
  getByMember(memberDetailsId: number, page = 1, pageSize = 50): Observable<ThreadWithMessagesDto[]> {
    let params = new HttpParams()
      .set('memberDetailsId', String(memberDetailsId))
      .set('page', String(page))
      .set('pageSize', String(pageSize));
    return this.http.get<ThreadWithMessagesDto[]>(`${this.baseUrl}`, { params });
  }

  // Convenience routes if you enabled them server side:
  // GET /api/message/user/{userId}?page=...&pageSize=...
  getByUserPath(userId: number, page = 1, pageSize = 50): Observable<ThreadWithMessagesDto[]> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('pageSize', String(pageSize));
    return this.http.get<ThreadWithMessagesDto[]>(`${this.baseUrl}/user/${userId}`, { params });
  }

  // GET /api/message/member/{memberDetailsId}?page=...&pageSize=...
  getByMemberPath(memberDetailsId: number, page = 1, pageSize = 50): Observable<ThreadWithMessagesDto[]> {
    let params = new HttpParams()
      .set('page', String(page))
      .set('pageSize', String(pageSize));
    return this.http.get<ThreadWithMessagesDto[]>(`${this.baseUrl}/member/${memberDetailsId}`, { params });
  }

  // GET /api/message/thread/{threadId}
  getThread(threadId: number): Observable<ThreadWithMessagesDto> {
    return this.http.get<ThreadWithMessagesDto>(`${this.baseUrl}/thread/${threadId}`);
  }

  // POST /api/message
  create(request: CreateMessageRequest): Observable<{ messageId: number; thread: ThreadWithMessagesDto }> {
    return this.http.post<{ messageId: number; thread: ThreadWithMessagesDto }>(`${this.baseUrl}`, request);
  }

  // PUT /api/message/{messageId}
  update(messageId: number, request: UpdateMessageRequest): Observable<void> {
    return this.http.put<void>(`${this.baseUrl}/${messageId}`, request);
  }

  // DELETE /api/message/{messageId}
  delete(messageId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${messageId}`);
  }
}

