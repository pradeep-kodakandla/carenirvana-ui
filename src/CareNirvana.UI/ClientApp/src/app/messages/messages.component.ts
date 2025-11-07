import { Component, Input, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MessagesService, ThreadWithMessagesDto, MessageDto, CreateMessageRequest, UpdateMessageRequest } from '../service/messages.service';
import { AuthenticateService } from 'src/app/service/authentication.service';
export interface SelectOption {
  value: number;
  label: string;
}

// Add near top with other UI types
type UiMessage = MessageDto & { level: number };
type UiThread = ThreadWithMessagesDto & { flatMessages: UiMessage[] };

type UiMessageGroup = {
  threadId: number;
  root: UiMessage;
  flat: UiMessage[];
};

type UiSubjectGroup = {
  subject: string;
  flat: UiMessage[];
};

@Component({
  selector: 'app-messages',
  templateUrl: './messages.component.html',
  styleUrls: ['./messages.component.css']
})
export class MessagesComponent implements OnInit {

  // New view mode
  groupMode: 'thread' | 'message' = 'message';

  @Input() memberDetailsId?: number | null;
  @Input() careStaffOptions: SelectOption[] = []; // [{value:12,label:'John Doe'}, ...]

  threads: ThreadWithMessagesDto[] = [];
  uiThreads: UiThread[] = [];
  //uiMessageGroups: UiMessageGroup[] = [];
  uiMessageGroups: UiSubjectGroup[] = [];

  searchTerm = '';
  loading = false;

  showEditor = false;
  isEditing = false;
  editingMessageId: number | null = null;
  selectedThreadId: number | null = null;

  editorForm!: FormGroup;

  get currentUserId(): number | null {
    const raw = sessionStorage.getItem('loggedInUserid');
    return raw ? Number(raw) : null;
  }

  constructor(private fb: FormBuilder, private messages: MessagesService, private authenticateService: AuthenticateService) { }

  ngOnInit(): void {
    this.editorForm = this.fb.group({
      otherUserId: [null, Validators.required],
      subject: [''],
      body: ['', [Validators.required, Validators.maxLength(4000)]],
      parentMessageId: [null]
    });
    this.loadUsers();
    this.load();
  }

  load(): void {
    if (!this.currentUserId) {
      console.warn('No loggedInUserid found in sessionStorage');
      this.loading = false;
      return;
    }

    this.loading = true;

    const page = 1, pageSize = 100;
    const src$ = this.memberDetailsId
      ? this.messages.getByMember(this.memberDetailsId, page, pageSize)
      : this.messages.getByUser(this.currentUserId, page, pageSize);

    src$.subscribe({
      next: list => {
        this.threads = Array.isArray(list) ? list : [];
        this.buildUi(this.threads);
        this.loading = false;
        console.log('Loaded threads count:', this.threads.length, this.threads);
      },
      error: err => {
        this.loading = false;
        console.error('Load threads failed:', err);
        this.threads = [];
      }
    });
  }


  loadUsers() {
    this.authenticateService.getAllUsers().subscribe({
      next: (users: any[]) => {
        this.careStaffOptions = users.map(u => ({
          value: u.userId,
          label: u.userName
        }));

      }
    });
  }
  get filteredThreads(): UiThread[] {
    const q = (this.searchTerm || '').trim().toLowerCase();
    if (!q) return this.uiThreads;

    const keep = (m: UiMessage) =>
      (m.body || '').toLowerCase().includes(q) ||
      String(m.senderUserId).includes(q);

    return this.uiThreads
      .map(t => ({ ...t, flatMessages: t.flatMessages.filter(keep) }))
      .filter(t => t.flatMessages.length > 0);
  }

  get filteredMessageGroups(): UiSubjectGroup[] {
    const q = (this.searchTerm || '').trim().toLowerCase();
    if (!q) return this.uiMessageGroups;

    const itemHit = (m: UiMessage) =>
      (m.body || '').toLowerCase().includes(q) ||
      (m.userName || '').toLowerCase().includes(q) ||
      String(m.senderUserId).includes(q);

    return this.uiMessageGroups
      .map(g => {
        // keep group if subject matches OR any message matches
        const subjectHit = g.subject.toLowerCase().includes(q);
        if (subjectHit) return g;
        const flat = g.flat.filter(itemHit);
        return flat.length ? { ...g, flat } : null as any;
      })
      .filter(Boolean) as UiSubjectGroup[];
  }


  addMessage(): void {
    this.isEditing = false;
    this.editingMessageId = null;
    this.selectedThreadId = null;
    this.editorForm.reset({ otherUserId: null, body: '', parentMessageId: null, subject: '', });
    this.editorForm.get('otherUserId')?.enable();
    this.editorForm.get('subject')?.enable(); 
    this.showEditor = true;
  }

  editMessage(thread: ThreadWithMessagesDto, msg: MessageDto): void {
    this.isEditing = true;
    this.editingMessageId = msg.messageId;
    this.selectedThreadId = thread.threadId;

    // other user is the opposite participant in this thread
    const otherId = this.resolveOtherUserId(thread);
    this.editorForm.reset({
      otherUserId: otherId,
      body: msg.body || '',
      subject: msg.subject || '',
      parentMessageId: msg.parentMessageId ?? null
    });
    // on edit, keep partner fixed
    this.editorForm.get('otherUserId')?.disable();
    this.editorForm.get('subject')?.disable(); 

    this.showEditor = true;
  }

  deleteMessage(msg: MessageDto): void {
    if (!confirm('Delete this message?')) return;
    this.messages.delete(msg.messageId).subscribe({
      next: () => this.load(),
      error: err => console.error(err)
    });
  }

  save(): void {
    if (this.editorForm.invalid) {
      this.editorForm.markAllAsTouched();
      return;
    }
    const createdUserId = this.currentUserId;
    const body = String(this.editorForm.value.body || '').trim();
    if (!body) return;

    if (this.isEditing && this.editingMessageId) {
      const req: UpdateMessageRequest = { body, createdUserId: Number(createdUserId) };
      this.messages.update(this.editingMessageId, req).subscribe({
        next: () => { this.cancelEdit(); this.load(); },
        error: err => console.error(err)
      });
      return;
    }

    // create
    const otherUserId = this.editorForm.get('otherUserId')?.value as number;
    const parentMessageId = this.editorForm.get('parentMessageId')?.value as number | null;
    const subject = (this.editorForm.get('subject')?.value ?? '').toString().trim() || null;

    const req: CreateMessageRequest = {
      otherUserId,
      memberDetailsId: this.memberDetailsId ?? null,
      parentMessageId: parentMessageId ?? null,
      body,
      subject,
      createdUserId: Number(createdUserId)
    };
    console.log('Creating message with request:', req);
    this.messages.create(req).subscribe({
      next: () => { this.cancelEdit(); this.load(); },
      error: err => console.error(err)
    });
  }

  resolveOtherUserId(thread: ThreadWithMessagesDto): number | null {
    if (!this.currentUserId) return null;
    return thread.user1Id === this.currentUserId ? thread.user2Id : thread.user1Id;
  }

  trackThread = (_: number, t: UiThread) => t.threadId;
  trackMessage = (_: number, m: UiMessage) => m.messageId;
  trackGroup = (_: number, g: UiMessageGroup) => g.root.messageId;
  trackSubjectGroup = (_: number, g: UiSubjectGroup) => g.subject;

  // Add this field near your other editor state
  replyingTo: MessageDto | null = null;

  // Add this helper to start a reply flow
  replyToMessage(thread: ThreadWithMessagesDto, msg: MessageDto): void {
    this.isEditing = false;                // reply creates a new message, not editing existing one
    this.editingMessageId = null;
    this.selectedThreadId = thread.threadId;
    this.replyingTo = msg;

    const subjectText = (msg.subject && msg.subject.trim().length > 0)
      ? msg.subject
      : 'Re:';

    // partner is the original sender of the message we're replying to
    const otherId = msg.senderUserId;

    // seed the form:
    this.editorForm.reset({
      otherUserId: otherId,
      subject: subjectText,
      body: '',
      parentMessageId: msg.messageId      // thread the reply
    });

    // lock partner (we're replying to that person)
    this.editorForm.get('otherUserId')?.disable();
    this.editorForm.get('subject')?.disable(); 

    this.showEditor = true;
  }

  // Optional: when canceling, clear the context
  cancelEdit(): void {
    this.showEditor = false;
    this.isEditing = false;
    this.editingMessageId = null;
    this.selectedThreadId = null;
    this.replyingTo = null;
  }

  // add this field on the component
  threadDict: { [id: number]: UiThread } = {};


  private buildUi(list: ThreadWithMessagesDto[] | null | undefined): void {
    const src = Array.isArray(list) ? list : [];

    // 1) Thread view
    this.uiThreads = src.map(t => ({
      ...t,
      flatMessages: this.flatten(t.messages, 0, [])
    }));

    this.threadDict = {};
    for (const t of this.uiThreads) this.threadDict[t.threadId] = t;

    // 2) Subject groups (group every root by its subject; include root + replies)
    const bucket = new Map<string, UiMessage[]>();

    for (const t of src) {
      for (const root of (t.messages || [])) {
        const key = this.normSubject(root.subject);
        const flat = this.flattenFromRoot(root); // root + replies, keeps original m.threadId
        const arr = bucket.get(key) ?? [];
        arr.push(...flat);
        bucket.set(key, arr);
      }
    }

    // materialize + sort groups by subject asc
    this.uiMessageGroups = Array.from(bucket.entries())
      .map(([subject, flat]) => ({ subject, flat }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }

  private normSubject(s?: string | null): string {
    const v = (s ?? '').trim();
    return v.length ? v : '(no subject)';
  }

  private flatten(messages: MessageDto[] | undefined, level = 0, out: UiMessage[] = []): UiMessage[] {
    if (!messages) return out;
    for (const m of messages) {
      out.push({ ...m, level });
      if (m.replies?.length) this.flatten(m.replies, level + 1, out);
    }
    return out;
  }

  private flattenFromRoot(root: MessageDto): UiMessage[] {
    // flatten a single root “conversation” tree
    return this.flatten([root], 0, []);
  }


}
