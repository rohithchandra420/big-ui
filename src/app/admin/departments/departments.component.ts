import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { AdminService, DeptSummary } from '../admin.service';
import { NotificationService } from '../../core/notification.service';
import { DepartmentCreateDialogComponent } from './department-create-dialog/department-create-dialog.component';
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

  constructor(
    private adminService: AdminService,
    private notificationService: NotificationService,
    private router: Router,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.loadDepartments();
  }

  loadDepartments() {
    this.loading = true;
    this.adminService.getDepartmentsSummary().subscribe({
      next: (depts) => { this.departments = depts; this.loading = false; },
      error: () => { this.notificationService.openErrorSnackBar('Error loading departments'); this.loading = false; }
    });
  }

  openCreateDialog() {
    const ref = this.dialog.open(DepartmentCreateDialogComponent, { width: '480px', disableClose: true });
    ref.afterClosed().subscribe(created => {
      if (created) {
        this.notificationService.openSucessSnackBar('Department created');
        this.loadDepartments();
      }
    });
  }

  editDepartment(dept: DeptSummary) {
    this.router.navigate(['/admin/departments', dept._id]);
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
          if (confirmed) this.deleteDepartment(dept._id, allUsers.length > 0);
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
