import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminService, DeptDetail } from '../../admin.service';
import { NotificationService } from '../../../core/notification.service';

interface UserChip { _id: string; name: string; departments?: any[]; }

@Component({
  selector: 'app-department-detail',
  templateUrl: './department-detail.component.html',
  styleUrls: ['./department-detail.component.css']
})
export class DepartmentDetailComponent implements OnInit {
  detail: DeptDetail | null = null;
  loading = false;
  editMode = false;
  saving = false;

  editForm = new FormGroup({
    name: new FormControl('', Validators.required),
    description: new FormControl('')
  });

  // Working sets during edit — changes are not persisted until Save is clicked
  editedTls: UserChip[] = [];
  editedVolunteers: UserChip[] = [];

  // All users for autocomplete dropdowns — loaded once on first Edit click
  allUsers: any[] = [];
  usersLoaded = false;

  // Autocomplete search inputs
  tlSearchCtrl = new FormControl('');
  volSearchCtrl = new FormControl('');
  filteredTlOptions: UserChip[] = [];
  filteredVolOptions: UserChip[] = [];

  // Maps userId → old dept name for volunteers being moved from another dept
  volWarnings: { [userId: string]: string } = {};

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private adminService: AdminService,
    private notificationService: NotificationService
  ) {}

  // Read :id from route params and load department detail
  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.loadDetail(id);
  }

  // Fetch full department detail (TLs + volunteers with their dept info)
  loadDetail(id: string) {
    this.loading = true;
    this.adminService.getDepartmentDetail(id).subscribe({
      next: (d) => { this.detail = d; this.loading = false; },
      error: () => { this.notificationService.openErrorSnackBar('Error loading department'); this.loading = false; }
    });
  }

  // Switch to edit mode — populate form and working sets from current detail; load users if not already done
  enterEditMode() {
    if (!this.detail) return;
    this.editForm.setValue({ name: this.detail.name, description: this.detail.description || '' });
    this.editedTls = this.detail.tls.map(t => ({ ...t }));
    this.editedVolunteers = this.detail.volunteers.map(v => ({ ...v }));
    this.volWarnings = {};
    this.editMode = true;
    if (!this.usersLoaded) this.loadAllUsers();
  }

  // Discard all edits and return to view mode
  cancelEdit() {
    this.editMode = false;
    this.tlSearchCtrl.setValue('');
    this.volSearchCtrl.setValue('');
    this.filteredTlOptions = [];
    this.filteredVolOptions = [];
    this.volWarnings = {};
  }

  // Load all platform users once; wire up autocomplete subscriptions after load
  private loadAllUsers() {
    this.adminService.getAllUsers().subscribe({
      next: (users) => {
        this.allUsers = users;
        this.usersLoaded = true;
        this.setupAutocomplete();
      },
      error: () => this.notificationService.openErrorSnackBar('Error loading users')
    });
  }

  // Subscribe to search input changes and refresh autocomplete option lists
  private setupAutocomplete() {
    this.tlSearchCtrl.valueChanges.subscribe(val => {
      this.filteredTlOptions = this.filterTlUsers(val || '');
    });
    this.volSearchCtrl.valueChanges.subscribe(val => {
      this.filteredVolOptions = this.filterVolUsers(val || '');
    });
  }

  // Return TL-eligible users (DIR/ADMIN/TL) that match search and are not already added
  private filterTlUsers(search: string): UserChip[] {
    const s = search.toLowerCase();
    const existingIds = new Set(this.editedTls.map(t => t._id));
    return this.allUsers
      .filter(u => ['TL', 'DIR', 'ADMIN'].includes(u.role?.name || ''))
      .filter(u => !existingIds.has(u._id))
      .filter(u => u.name.toLowerCase().includes(s))
      .map(u => ({ _id: u._id, name: u.name }));
  }

  // Return VOL users that match search and are not already added
  private filterVolUsers(search: string): UserChip[] {
    const s = search.toLowerCase();
    const existingIds = new Set(this.editedVolunteers.map(v => v._id));
    return this.allUsers
      .filter(u => u.role?.name === 'VOL')
      .filter(u => !existingIds.has(u._id))
      .filter(u => u.name.toLowerCase().includes(s))
      .map(u => ({ _id: u._id, name: u.name, departments: u.departments }));
  }

  // Add a TL chip and refresh the filtered options list
  onTlSelected(user: UserChip) {
    this.editedTls.push({ _id: user._id, name: user.name });
    this.tlSearchCtrl.setValue('');
    this.filteredTlOptions = this.filterTlUsers('');
  }

  // Add a VOL chip; if they belong to a different dept, record a reassignment warning
  onVolSelected(user: UserChip) {
    const fullUser = this.allUsers.find(u => u._id === user._id);
    this.editedVolunteers.push({ _id: user._id, name: user.name, departments: fullUser?.departments });

    const depts: any[] = fullUser?.departments || [];
    const otherDept = depts.find(da => {
      const deptId = da.department?._id || da.department;
      return deptId?.toString() !== this.detail?._id?.toString();
    });
    if (otherDept) {
      this.volWarnings[user._id] = otherDept.department?.name || 'another department';
    }

    this.volSearchCtrl.setValue('');
    this.filteredVolOptions = this.filterVolUsers('');
  }

  // Remove a TL chip and re-run autocomplete filter so they reappear as an option
  removeTl(id: string) {
    this.editedTls = this.editedTls.filter(t => t._id !== id);
    this.filteredTlOptions = this.filterTlUsers(this.tlSearchCtrl.value || '');
  }

  // Remove a VOL chip, clear any reassignment warning for that user
  removeVol(id: string) {
    this.editedVolunteers = this.editedVolunteers.filter(v => v._id !== id);
    delete this.volWarnings[id];
    this.filteredVolOptions = this.filterVolUsers(this.volSearchCtrl.value || '');
  }

  // Returns the list of active reassignment warnings for the warning banner
  get warningList(): { name: string; fromDept: string }[] {
    return Object.entries(this.volWarnings).map(([id, fromDept]) => {
      const vol = this.editedVolunteers.find(v => v._id === id);
      return { name: vol?.name || '', fromDept };
    });
  }

  // Diff edited vs original sets to produce addUserIds / removeUserIds, then PATCH the department
  save() {
    if (!this.detail || this.editForm.invalid || this.saving) return;
    this.saving = true;

    const originalAllIds = new Set([
      ...this.detail.tls.map(t => t._id),
      ...this.detail.volunteers.map(v => v._id)
    ]);
    const editedAllIds = new Set([
      ...this.editedTls.map(t => t._id),
      ...this.editedVolunteers.map(v => v._id)
    ]);

    const addUserIds = [...editedAllIds].filter(id => !originalAllIds.has(id));
    const removeUserIds = [...originalAllIds].filter(id => !editedAllIds.has(id));

    const { name, description } = this.editForm.value;
    this.adminService.updateDepartment(this.detail._id, {
      name: name!.trim(),
      description: description || '',
      addUserIds,
      removeUserIds
    }).subscribe({
      next: () => {
        this.saving = false;
        this.editMode = false;
        this.volWarnings = {};
        this.notificationService.openSucessSnackBar('Department updated');
        this.loadDetail(this.detail!._id);
      },
      error: (err) => {
        this.saving = false;
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Error saving department');
      }
    });
  }

  // Navigate back to the departments list page
  goBack() {
    this.router.navigate(['/admin/departments']);
  }
}
