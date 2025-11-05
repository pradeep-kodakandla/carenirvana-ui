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
  root: UiMessage;        // the root message
  flat: UiMessage[];      // root + its replies flattened
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
  uiMessageGroups: UiMessageGroup[] = [];

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

    console.log('Loading messages for userId:', this.currentUserId, 'member:', this.memberDetailsId ?? '(none)');

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

  get filteredMessageGroups(): UiMessageGroup[] {
    const q = (this.searchTerm || '').trim().toLowerCase();
    if (!q) return this.uiMessageGroups;

    const keep = (m: UiMessage) =>
      (m.body || '').toLowerCase().includes(q) ||
      String(m.senderUserId).includes(q);

    return this.uiMessageGroups
      .map(g => ({ ...g, flat: g.flat.filter(keep) }))
      .filter(g => g.flat.length > 0);
  }



  addMessage(): void {
    this.isEditing = false;
    this.editingMessageId = null;
    this.selectedThreadId = null;
    this.editorForm.reset({ otherUserId: null, body: '', parentMessageId: null });
    this.editorForm.get('otherUserId')?.enable();
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
      parentMessageId: msg.parentMessageId ?? null
    });
    // on edit, keep partner fixed
    this.editorForm.get('otherUserId')?.disable();

    this.showEditor = true;
  }

  deleteMessage(msg: MessageDto): void {
    if (!confirm('Delete this message?')) return;
    this.messages.delete(msg.messageId).subscribe({
      next: () => this.load(),
      error: err => console.error(err)
    });
  }

  //cancelEdit(): void {
  //  this.showEditor = false;
  //  this.isEditing = false;
  //  this.editingMessageId = null;
  //  this.selectedThreadId = null;
  //}

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

    const req: CreateMessageRequest = {
      otherUserId,
      memberDetailsId: this.memberDetailsId ?? null,
      parentMessageId: parentMessageId ?? null,
      body,
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



  // Add this field near your other editor state
  replyingTo: MessageDto | null = null;

  // Add this helper to start a reply flow
  replyToMessage(thread: ThreadWithMessagesDto, msg: MessageDto): void {
    this.isEditing = false;                // reply creates a new message, not editing existing one
    this.editingMessageId = null;
    this.selectedThreadId = thread.threadId;
    this.replyingTo = msg;

    // partner is the original sender of the message we're replying to
    const otherId = msg.senderUserId;

    // seed the form:
    this.editorForm.reset({
      otherUserId: otherId,               // reply to the sender
      body: '',
      parentMessageId: msg.messageId      // thread the reply
    });

    // lock partner (we're replying to that person)
    this.editorForm.get('otherUserId')?.disable();

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




  private flatten(messages: MessageDto[] | undefined, level = 0, out: UiMessage[] = []): UiMessage[] {
    if (!messages) return out;
    for (const m of messages) {
      out.push({ ...m, level });
      if (m.replies?.length) this.flatten(m.replies, level + 1, out);
    }
    return out;
  }

  private flattenFromRoot(root: MessageDto): UiMessage[] {
    // Flatten starting from a specific root
    const copy: MessageDto = { ...root, replies: root.replies || [] };
    return this.flatten([copy], 0, []);
  }

  // add this field on the component
  threadDict: { [id: number]: UiThread } = {};

  // after you compute uiThreads in buildUi(...)
  private buildUi(list: ThreadWithMessagesDto[] | null | undefined): void {
    const src = Array.isArray(list) ? list : [];

    // 1) threads view
    this.uiThreads = src.map(t => ({
      ...t,
      flatMessages: this.flatten(t.messages, 0, [])
    }));

    // keep a dictionary for quick lookup in the template
    this.threadDict = {};
    for (const t of this.uiThreads) this.threadDict[t.threadId] = t;

    // 2) message groups (unchanged)
    const groups: UiMessageGroup[] = [];
    for (const t of src) {
      for (const root of (t.messages || [])) {
        const flat = this.flattenFromRoot(root);
        groups.push({ threadId: t.threadId, root: flat[0], flat });
      }
    }
    this.uiMessageGroups = groups.sort((a, b) =>
      new Date(a.root.createdOn).getTime() - new Date(b.root.createdOn).getTime()
    );
  }


}
