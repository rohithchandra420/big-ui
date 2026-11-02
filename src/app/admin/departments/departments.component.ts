import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { AdminService, DeptSummary } from '../admin.service';
import { NotificationService } from '../../core/notification.service';
import { DepartmentDeleteDialogComponent } from './department-delete-dialog/department-delete-dialog.component';

@Component({
  selector: 'app-departments',
  templateUrl: './departments.component.html',
  styleUrls: ['./departments.component.css']
})
export class DepartmentsComponent implements OnInit {
  departments: DeptSummary[] = [];
  loading = false;
  deletingId: string | null = null;

  // Slide-in panel (view / edit / create). panelDeptId null = Create.
  panelOpen = false;
  panelDeptId: string | null = null;

  constructor(
    private adminService: AdminService,
    private notificationService: NotificationService,
    private router: Router,
    private route: ActivatedRoute,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.loadDepartments();
    // /admin/departments/:id opens the list with that department's panel open.
    this.route.paramMap.subscribe(p => {
      const id = p.get('id');
      if (id) this.openPanel(id);
    });
  }

  loadDepartments() {
    this.loading = true;
    this.adminService.getDepartmentsSummary().subscribe({
      next: (depts) => { this.departments = depts; this.loading = false; },
      error: () => { this.notificationService.openErrorSnackBar('Error loading departments'); this.loading = false; }
    });
  }

  openCreate() {
    this.openPanel(null);
  }

  openDepartment(dept: DeptSummary) {
    this.openPanel(dept._id);
  }

  private openPanel(id: string | null) {
    this.panelDeptId = id;
    this.panelOpen = true;
  }

  closePanel() {
    this.panelOpen = false;
    // Leave a deep link (/admin/departments/:id) once the panel closes.
    if (this.route.snapshot.paramMap.get('id')) this.router.navigate(['/admin/departments']);
  }

  /** After a create or save: refresh the cards and show that department. */
  onDeptChanged(id: string) {
    this.loadDepartments();
    this.panelDeptId = id;
  }

  openDeleteDialog(dept: DeptSummary) {
    this.adminService.getDepartmentDetail(dept._id).subscribe({
      next: (detail) => {
        const allUsers = [...detail.tls, ...detail.volunteers];
        const ref = this.dialog.open(DepartmentDeleteDialogComponent, {
          width: '440px',
          data: { deptName: dept.name, users: allUsers }
        });
        ref.afterClosed().subscribe(confirmed => {
          if (!confirmed) return;
          if (this.panelDeptId === dept._id) this.closePanel();
          this.deleteDepartment(dept._id, allUsers.length > 0);
        });
      },
      error: () => this.notificationService.openErrorSnackBar('Error loading department details')
    });
  }

  private deleteDepartment(id: string, force: boolean) {
    this.deletingId = id;
    this.adminService.deleteDepartment(id, force).subscribe({
      next: () => {
        this.deletingId = null;
        this.notificationService.openSucessSnackBar('Department deleted');
        this.loadDepartments();
      },
      error: (err) => {
        this.deletingId = null;
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Error deleting department');
      }
    });
  }

  tlNames(dept: DeptSummary): string {
    return dept.tls.map(t => t.name).join(', ') || '—';
  }
}
