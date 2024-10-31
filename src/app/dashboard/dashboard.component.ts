import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { Chart, registerables } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

import { User } from '../core/user.model';
import { DashboardService } from './dashboard.service';
import { NotificationService } from '../core/notification.service';
import { Shopcart } from '../models/ticket.model';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {

  chart: any = [];
  title = 'ng-chart';
  shopItemList: Shopcart[];
  mainChart: Chart<'doughnut', number[], string> | undefined;
  accomChart: Chart<'doughnut', number[], string> | undefined;
  vehicleChart: Chart<'doughnut', number[], string> | undefined;

  TotalFestivalPasses: number = 0;
  TotalFestPassAdmitted: number = 0;
  RemaingFestPassToAdmit: number = 0;

  TotalPYOTPasses: number = 0;
  TotalPYOTPassAdmitted: number = 0;
  RemaingPYOTtPassToAdmit: number = 0;

  TotalSoloTPasses: number = 0;
  TotalSoloTPassAdmitted: number = 0;
  RemaingSoloTToAdmit: number = 0;

  TotalSharedTPasses: number = 0;
  TotalSharedTPassAdmitted: number = 0;
  RemaingSharedTToAdmit: number = 0;

  TotalFamilyTPasses = 0;
  TotalFamilyTPassAdmitted = 0;
  RemaingFamilyTToAdmit = 0;

  TotalGTSPPasses = 0;
  TotalGTSPPassAdmitted = 0;
  RemaingGTSPToAdmit = 0;

  TotalGTPWPasses = 0;
  TotalGTPWPassAdmitted = 0;
  RemaingGTPWToAdmit = 0;

  TotalDeluxPasses = 0;
  TotalDeluxPassAdmitted = 0;
  RemaingDeluxToAdmit = 0;

  TotalCaravanPasses = 0;
  TotalCaravanPassAdmitted = 0;
  RemaingCaravanToAdmit = 0;

  TotalEScooterPasses = 0;
  TotalEScooterPassAdmitted = 0;
  RemaingEScooterToAdmit = 0;

  constructor(private route: ActivatedRoute, private dashboardService: DashboardService,
    private notificationService: NotificationService) {
    Chart.register(...registerables, ChartDataLabels);
  }

  ngOnInit() {
    this.createDoughnutChart();
    this.getAllShopItems();
  }

  getAllShopItems() {
    this.dashboardService.getallShopItems().subscribe((res) => {
      this.shopItemList = res;
      if (this.shopItemList.length) {
        console.log(this.shopItemList);

        this.getFestivalPassCount(this.shopItemList);
        this.getPYOTPassCount(this.shopItemList);
        this.getSoloTentPassCount(this.shopItemList);
        this.getSharedTentPassCount(this.shopItemList);
        this.getFamilyTentPassCount(this.shopItemList);
        this.getGTSPPassCount(this.shopItemList);
        this.getGTPWPassCount(this.shopItemList);
        this.getDeluxPassCount(this.shopItemList);

        this.getDataForMainChart(this.shopItemList);

      } else {
        this.notificationService.openSucessSnackBar("No Ticket Passes");
      }

    }, (error) => {
      console.log(error);
      this.notificationService.openErrorSnackBar("Error: " + error.error);
    })
  }

  getDataForAccomodationChart(data: Shopcart[]) {
    this.getPYOTPassCount(data);
    this.getSoloTentPassCount(data);
    this.getSharedTentPassCount(data);
    this.getFamilyTentPassCount(data);
    this.getGTSPPassCount(data);
    this.getGTPWPassCount(data);
    this.getDeluxPassCount(data);
  }

  getFestivalPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name == "Festival Ticket";
    });

    this.TotalFestivalPasses = totalFestPasses.length;
    this.TotalFestPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingFestPassToAdmit = this.TotalFestivalPasses - this.TotalFestPassAdmitted;
  }

  getPYOTPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name === 'PYOT (Pitch Your Own Tent)';
    });

    this.TotalPYOTPasses = totalFestPasses.length;
    this.TotalPYOTPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingPYOTtPassToAdmit = this.TotalPYOTPasses - this.TotalPYOTPassAdmitted;
  }

  getSoloTentPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name === 'Solo Tent';
    });

    this.TotalSoloTPasses = totalFestPasses.length;
    this.TotalSoloTPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingSoloTToAdmit = this.TotalSoloTPasses - this.TotalSoloTPassAdmitted;
  }

  getSharedTentPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name === 'Shared Tent';
    });

    this.TotalSharedTPasses = totalFestPasses.length;
    this.TotalSharedTPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingSharedTToAdmit = this.TotalSharedTPasses - this.TotalSharedTPassAdmitted;
  }

  getFamilyTentPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name === 'Family Tent';
    });

    this.TotalFamilyTPasses = totalFestPasses.length;
    this.TotalFamilyTPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingFamilyTToAdmit = this.TotalFamilyTPasses - this.TotalFamilyTPassAdmitted;
  }

  getGTSPPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name === 'Glamping Tent for Single Person';
    });

    this.TotalGTSPPasses = totalFestPasses.length;
    this.TotalGTSPPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingGTSPToAdmit = this.TotalGTSPPasses - this.TotalGTSPPassAdmitted;
  }

  getGTPWPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name === 'Glamping Tent for Single Person';
    });

    this.TotalGTPWPasses = totalFestPasses.length;
    this.TotalGTPWPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingGTPWToAdmit = this.TotalGTPWPasses - this.TotalGTPWPassAdmitted;
  }

  getDeluxPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name === 'Glamping Tent for Single Person';
    });

    this.TotalDeluxPasses = totalFestPasses.length;
    this.TotalDeluxPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingDeluxToAdmit = this.TotalDeluxPasses - this.TotalDeluxPassAdmitted;
  }

  getCaravanPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name === 'Glamping Tent for Single Person';
    });

    this.TotalCaravanPasses = totalFestPasses.length;
    this.TotalCaravanPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingCaravanToAdmit = this.TotalCaravanPasses - this.TotalCaravanPassAdmitted;
  }

  getEScooterPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name === 'Glamping Tent for Single Person';
    });

    this.TotalEScooterPasses = totalFestPasses.length;
    this.TotalEScooterPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingEScooterToAdmit = this.TotalEScooterPasses - this.TotalEScooterPassAdmitted;
  }

  createDoughnutChart(): void {
    const ctx = document.getElementById('mainDataChart') as HTMLCanvasElement;

    this.mainChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Festival Admitted', 'Festival Yet To Admit', 'Accomodation Admitted', 'Accomodation Yet To Admit'],
        datasets: [{
          label: 'Festival Ticket Allocated',
          data: [10, 20], // Example values for each fruit
          backgroundColor: ['#004d00', '#00cc00', '#FF7B00', '#FFB76B'], // Dark green, green, 99ff99light green
          borderWidth: 1
        },
        {
          label: 'Accomodation',
          data: [10, 10], // Example values for each fruit
          backgroundColor: ['#004d00', '#00cc00', '#FF7B00', '#FFB76B'], // Dark green, green, Dark Orange, LightOrange
          borderWidth: 1
        }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'top',
          },
          title: {
            display: true,
            text: 'Overall Admission'
          },
          datalabels: {
            color: '#ffffff', // Change to a contrasting color for visibility
            formatter: (value, context) => {
              const label = context.chart.data.labels[context.dataIndex]; // Get label for each segment
              return `${value}`; // Show label and value on the chart
            }
          },
          tooltip: {
            position: 'nearest', // Set tooltip position to nearest cursor
            external: (context) => {
              // Custom external tooltip positioning
              const tooltipEl = document.getElementById('tooltip');
              if (!tooltipEl) return;

              // If no tooltip item is found, hide the tooltip
              if (context.tooltip.opacity === 0) {
                tooltipEl.style.opacity = '0';
                return;
              }

              // Set tooltip content
              const { labels, datasets } = context.chart.data;
              const tooltipItem = context.tooltip;
              const label = labels[tooltipItem.dataPoints[0].dataIndex];
              const value = tooltipItem.dataPoints[0].formattedValue;

              tooltipEl.innerHTML = `<strong>${label}</strong>: ${value}`;
              tooltipEl.style.opacity = '1';
              tooltipEl.style.left = `${tooltipItem.x}px`;
              tooltipEl.style.top = `${tooltipItem.y}px`;
            },
            callbacks: {
              title: (tooltipItems) => {
                // Return the dataset label as the title
                return tooltipItems[0].dataset.label || '';
              },
              label: (tooltipItem) => {
                const dataset = tooltipItem.dataset;
                console.log(dataset);
                const dataIndex = tooltipItem.dataIndex;
                const value = dataset.data[dataIndex];
                const total = dataset.data.reduce((acc, val) => acc + val, 0);
                const percentage = ((value / total) * 100).toFixed(2) + '%';
                return `${tooltipItem.label}: ${percentage}`; // Show percentage in the tooltip
              },
            },
            // // Custom position callback to set the tooltip position at the cursor
            // position: (tooltipItems) => {
            //   const { x, y } = tooltipItems[0].element; // Get the position of the element
            //   return { x, y }; // Return the position to place the tooltip
            // }
          }
        }
      }
    }) as Chart<'doughnut', number[], string>;

    const ctx2 = document.getElementById('accomodationChart') as HTMLCanvasElement;

    this.accomChart = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['Shared Tent Admitted', 'Shared Tent Yet To Admit', 
                  'Solo Tent Admitted', 'Solo Tent Yet To Admit',
                  'Family Tent Admitted', 'Family Tent Yet To Admit',
                  'GTSP Admitted', 'GTSP Yet To Admit',
                  'GTPW Admitted', 'GTPW Yet To Admit',
                  'Delux Room Admitted', 'Delux Room Yet To Admit',
                ],
        datasets: [{
          label: 'Shared Tent',
          data: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], // Example values for each fruit
          backgroundColor: ['#004d00', '#00cc00', '#FF7B00', '#FFB76B'], // Dark green, green, 99ff99light green
          borderWidth: 1
        },
        {
          label: 'Solo Tent',
          data: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], // Example values for each fruit
          backgroundColor: ['#004d00', '#00cc00', '#FF7B00', '#FFB76B'], // Dark green, green, Dark Orange, LightOrange
          borderWidth: 1
        },
        {
          label: 'Family Tent',
          data: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], // Example values for each fruit
          backgroundColor: ['#004d00', '#00cc00', '#FF7B00', '#FFB76B'], // Dark green, green, Dark Orange, LightOrange
          borderWidth: 1
        },
        {
          label: 'GTSP Tent',
          data: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], // Example values for each fruit
          backgroundColor: ['#004d00', '#00cc00', '#FF7B00', '#FFB76B'], // Dark green, green, Dark Orange, LightOrange
          borderWidth: 1
        },
        
        {
          label: 'GTPW Tent',
          data: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], // Example values for each fruit
          backgroundColor: ['#004d00', '#00cc00', '#FF7B00', '#FFB76B'], // Dark green, green, Dark Orange, LightOrange
          borderWidth: 1
        },
        {
          label: 'Delux Tent',
          data: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10], // Example values for each fruit
          backgroundColor: ['#004d00', '#00cc00', '#FF7B00', '#FFB76B'], // Dark green, green, Dark Orange, LightOrange
          borderWidth: 1
        },
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'top',
          },
          title: {
            display: true,
            text: 'Accomodation Admission'
          },
          datalabels: {
            color: '#ffffff', // Change to a contrasting color for visibility
            formatter: (value, context) => {
              const label = context.chart.data.labels[context.dataIndex]; // Get label for each segment
              return `${value}`; // Show label and value on the chart
            }
          },
          tooltip: {
            position: 'nearest', // Set tooltip position to nearest cursor
            external: (context) => {
              // Custom external tooltip positioning
              const tooltipEl = document.getElementById('tooltip');
              if (!tooltipEl) return;

              // If no tooltip item is found, hide the tooltip
              if (context.tooltip.opacity === 0) {
                tooltipEl.style.opacity = '0';
                return;
              }

              // Set tooltip content
              const { labels, datasets } = context.chart.data;
              const tooltipItem = context.tooltip;
              const label = labels[tooltipItem.dataPoints[0].dataIndex];
              const value = tooltipItem.dataPoints[0].formattedValue;

              tooltipEl.innerHTML = `<strong>${label}</strong>: ${value}`;
              tooltipEl.style.opacity = '1';
              tooltipEl.style.left = `${tooltipItem.x}px`;
              tooltipEl.style.top = `${tooltipItem.y}px`;
            },
            callbacks: {
              title: (tooltipItems) => {
                // Return the dataset label as the title
                return tooltipItems[0].dataset.label || '';
              },
              label: (tooltipItem) => {
                const dataset = tooltipItem.dataset;
                console.log(dataset);
                const dataIndex = tooltipItem.dataIndex;
                const value = dataset.data[dataIndex];
                const total = dataset.data.reduce((acc, val) => acc + val, 0);
                const percentage = ((value / total) * 100).toFixed(2) + '%';
                return `${tooltipItem.label}: ${percentage}`; // Show percentage in the tooltip
              },
            },
            // // Custom position callback to set the tooltip position at the cursor
            // position: (tooltipItems) => {
            //   const { x, y } = tooltipItems[0].element; // Get the position of the element
            //   return { x, y }; // Return the position to place the tooltip
            // }
          }
        }
      }
    }) as Chart<'doughnut', number[], string>;

    const ctx3 = document.getElementById('vehicleChart') as HTMLCanvasElement;

    this.vehicleChart = new Chart(ctx3, {
      type: 'doughnut',
      data: {
        labels: ['Festival Admitted', 'Festival Yet To Admit', 'Accomodation Admitted', 'Accomodation Yet To Admit'],
        datasets: [{
          label: 'Festival Ticket Allocated',
          data: [10, 20], // Example values for each fruit
          backgroundColor: ['#004d00', '#00cc00', '#FF7B00', '#FFB76B'], // Dark green, green, 99ff99light green
          borderWidth: 1
        },
        {
          label: 'Accomodation',
          data: [10, 10], // Example values for each fruit
          backgroundColor: ['#004d00', '#00cc00', '#FF7B00', '#FFB76B'], // Dark green, green, Dark Orange, LightOrange
          borderWidth: 1
        }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'top',
          },
          title: {
            display: true,
            text: 'Overall Admission'
          },
          datalabels: {
            color: '#ffffff', // Change to a contrasting color for visibility
            formatter: (value, context) => {
              const label = context.chart.data.labels[context.dataIndex]; // Get label for each segment
              return `${value}`; // Show label and value on the chart
            }
          },
          tooltip: {
            position: 'nearest', // Set tooltip position to nearest cursor
            external: (context) => {
              // Custom external tooltip positioning
              const tooltipEl = document.getElementById('tooltip');
              if (!tooltipEl) return;

              // If no tooltip item is found, hide the tooltip
              if (context.tooltip.opacity === 0) {
                tooltipEl.style.opacity = '0';
                return;
              }

              // Set tooltip content
              const { labels, datasets } = context.chart.data;
              const tooltipItem = context.tooltip;
              const label = labels[tooltipItem.dataPoints[0].dataIndex];
              const value = tooltipItem.dataPoints[0].formattedValue;

              tooltipEl.innerHTML = `<strong>${label}</strong>: ${value}`;
              tooltipEl.style.opacity = '1';
              tooltipEl.style.left = `${tooltipItem.x}px`;
              tooltipEl.style.top = `${tooltipItem.y}px`;
            },
            callbacks: {
              title: (tooltipItems) => {
                // Return the dataset label as the title
                return tooltipItems[0].dataset.label || '';
              },
              label: (tooltipItem) => {
                const dataset = tooltipItem.dataset;
                console.log(dataset);
                const dataIndex = tooltipItem.dataIndex;
                const value = dataset.data[dataIndex];
                const total = dataset.data.reduce((acc, val) => acc + val, 0);
                const percentage = ((value / total) * 100).toFixed(2) + '%';
                return `${tooltipItem.label}: ${percentage}`; // Show percentage in the tooltip
              },
            },
            // // Custom position callback to set the tooltip position at the cursor
            // position: (tooltipItems) => {
            //   const { x, y } = tooltipItems[0].element; // Get the position of the element
            //   return { x, y }; // Return the position to place the tooltip
            // }
          }
        }
      }
    }) as Chart<'doughnut', number[], string>;
  }

  getDataForMainChart(data: Shopcart[]) {
    //const mainChartLablel = ['Festival Ticket Allocated', 'Accomodation'];
    this.getFestivalPassCount(data);
    this.getDataForAccomodationChart(data);

    const accomAdmitted = this.TotalPYOTPassAdmitted + this.TotalSoloTPassAdmitted +
      this.TotalSharedTPassAdmitted + this.TotalFamilyTPassAdmitted +
      this.TotalGTSPPassAdmitted + this.TotalGTPWPassAdmitted +
      this.TotalDeluxPassAdmitted;

    const accomRemaining = this.RemaingPYOTtPassToAdmit + this.RemaingSoloTToAdmit +
      this.RemaingSharedTToAdmit + this.RemaingFamilyTToAdmit +
      this.RemaingGTSPToAdmit + this.RemaingGTPWToAdmit +
      this.RemaingDeluxToAdmit;

    if (this.mainChart) {
      // Update the data and labels
      this.mainChart.data.datasets[0].data = [this.TotalFestPassAdmitted, this.RemaingFestPassToAdmit, 0, 0];
      this.mainChart.data.datasets[1].data = [0, 0, accomAdmitted,];
      //this.mainChart.data.labels = newLabels;

      // Call the update method to re-render the chart
      this.mainChart.update();
    }
  }

  getDataForAccomChart(data: Shopcart[]) {
    //const mainChartLablel = ['Festival Ticket Allocated', 'Accomodation'];

    const accomAdmitted = this.TotalPYOTPassAdmitted + this.TotalSoloTPassAdmitted +
      this.TotalSharedTPassAdmitted + this.TotalFamilyTPassAdmitted +
      this.TotalGTSPPassAdmitted + this.TotalGTPWPassAdmitted +
      this.TotalDeluxPassAdmitted;

    const accomRemaining = this.RemaingPYOTtPassToAdmit + this.RemaingSoloTToAdmit +
      this.RemaingSharedTToAdmit + this.RemaingFamilyTToAdmit +
      this.RemaingGTSPToAdmit + this.RemaingGTPWToAdmit +
      this.RemaingDeluxToAdmit;

    if (this.mainChart) {
      // Update the data and labels
      this.mainChart.data.datasets[0].data = [this.TotalFestPassAdmitted, this.RemaingFestPassToAdmit, 0, 0];
      this.mainChart.data.datasets[1].data = [0, 0, accomAdmitted,];
      //this.mainChart.data.labels = newLabels;

      // Call the update method to re-render the chart
      this.mainChart.update();
    }
  }

}
