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
  festBarChart: Chart<'bar', number[], string> | undefined;
  accomBarChart: Chart<'bar', number[], string> | undefined;
  vehicleBarChart: Chart<'bar', number[], string> | undefined;

  TotalFestivalPasses: number = 0;
  TotalFestPassAdmitted: number = 0;
  RemaingFestPassToAdmit: number = 0;

  TotalWeekendPasses: number = 0;
  TotalWeekendPassAdmitted: number = 0;
  RemaingWeekendPassToAdmit: number = 0;

  TotalDayPasses: number = 0;
  TotalDayPassAdmitted: number = 0;
  RemaingDayPassToAdmit: number = 0;

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

        this.getFestivalPassCount(this.shopItemList);
        this.getWeekendPassCount(this.shopItemList);
        this.getDayPassCount(this.shopItemList);
        
        this.getPYOTPassCount(this.shopItemList);
        this.getSoloTentPassCount(this.shopItemList);
        this.getSharedTentPassCount(this.shopItemList);
        this.getFamilyTentPassCount(this.shopItemList);
        this.getGTSPPassCount(this.shopItemList);
        this.getGTPWPassCount(this.shopItemList);
        this.getDeluxPassCount(this.shopItemList);

        this.getCaravanPassCount(this.shopItemList);
        this.getEScooterPassCount(this.shopItemList);

        this.getDataForMainChart();
        this.getDataForFestBarChart();
        this.getDataForAccomBarChart();
        this.getDataForVehicelBarChart();

      } else {
        this.notificationService.openSucessSnackBar("No Ticket Passes");
      }

    }, (error) => {
      console.log(error);
      this.notificationService.openErrorSnackBar(error.error);
    })
  }

  getFestivalPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name == "Festival Ticket";
    });

    this.TotalFestivalPasses = totalFestPasses.length;
    this.TotalFestPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingFestPassToAdmit = this.TotalFestivalPasses - this.TotalFestPassAdmitted;

    // console.log("this.TotalFestivalPasses: ", this.TotalFestivalPasses);
    // console.log("this.TotalFestPassAdmitted: ", this.TotalFestPassAdmitted);
    // console.log("this.RemaingFestPassToAdmit: ", this.RemaingFestPassToAdmit);
  }

  getWeekendPassCount(data) {
    const totalWeekendPasses = data.filter(pass => {
      return pass.item_name == "Weekend pass";
    });

    this.TotalWeekendPasses = totalWeekendPasses.length;
    this.TotalWeekendPassAdmitted = totalWeekendPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingWeekendPassToAdmit = this.TotalWeekendPasses - this.TotalWeekendPassAdmitted;

    // console.log("this.TotalFestivalPasses: ", this.TotalFestivalPasses);
    // console.log("this.TotalFestPassAdmitted: ", this.TotalFestPassAdmitted);
    // console.log("this.RemaingFestPassToAdmit: ", this.RemaingFestPassToAdmit);
  }

  getDayPassCount(data) {
    const totalDayPasses = data.filter(pass => {
      return pass.item_name == "Day Pass";
    });

    this.TotalDayPasses = totalDayPasses.length;
    this.TotalDayPassAdmitted = totalDayPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingDayPassToAdmit = this.TotalDayPasses - this.TotalDayPassAdmitted;

    // console.log("this.TotalFestivalPasses: ", this.TotalFestivalPasses);
    // console.log("this.TotalFestPassAdmitted: ", this.TotalFestPassAdmitted);
    // console.log("this.RemaingFestPassToAdmit: ", this.RemaingFestPassToAdmit);
  }

  getPYOTPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name === 'PYOT (Pitch Your Own Tent)';
    });

    this.TotalPYOTPasses = totalFestPasses.length;
    this.TotalPYOTPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingPYOTtPassToAdmit = this.TotalPYOTPasses - this.TotalPYOTPassAdmitted;

    // console.log("this.TotalPYOTPasses: ", this.TotalPYOTPasses);
    // console.log("this.TotalPYOTPassAdmitted: ", this.TotalPYOTPassAdmitted);
    // console.log("this.RemaingPYOTtPassToAdmit: ", this.RemaingPYOTtPassToAdmit);
  }

  getSoloTentPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name === 'Solo Tent';
    });

    this.TotalSoloTPasses = totalFestPasses.length;
    this.TotalSoloTPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingSoloTToAdmit = this.TotalSoloTPasses - this.TotalSoloTPassAdmitted;

    // console.log("this.TotalSoloTPasses: ", this.TotalSoloTPasses);
    // console.log("this.TotalSoloTPassAdmitted: ", this.TotalSoloTPassAdmitted);
    // console.log("this.RemaingSoloTToAdmit: ", this.RemaingSoloTToAdmit);
  }

  getSharedTentPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name === 'Shared Tent';
    });

    this.TotalSharedTPasses = totalFestPasses.length;
    this.TotalSharedTPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingSharedTToAdmit = this.TotalSharedTPasses - this.TotalSharedTPassAdmitted;

    // console.log("this.TotalSharedTPasses: ", this.TotalSharedTPasses);
    // console.log("this.TotalSharedTPassAdmitted: ", this.TotalSharedTPassAdmitted);
    // console.log("this.RemaingSharedTToAdmit: ", this.RemaingSharedTToAdmit);
  }

  getFamilyTentPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name === 'Family Tent';
    });

    this.TotalFamilyTPasses = totalFestPasses.length;
    this.TotalFamilyTPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingFamilyTToAdmit = this.TotalFamilyTPasses - this.TotalFamilyTPassAdmitted;
    
    // console.log("this.TotalFamilyTPasses: ", this.TotalFamilyTPasses);
    // console.log("this.TotalFamilyTPassAdmitted: ", this.TotalFamilyTPassAdmitted);
    // console.log("this.RemaingFamilyTToAdmit: ", this.RemaingFamilyTToAdmit);
  }

  getGTSPPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name === 'Glamping Tent For 1 Person.';
    });

    this.TotalGTSPPasses = totalFestPasses.length;
    this.TotalGTSPPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingGTSPToAdmit = this.TotalGTSPPasses - this.TotalGTSPPassAdmitted;
    
    // console.log("this.TotalGTSPPasses: ", this.TotalGTSPPasses);
    // console.log("this.TotalGTSPPassAdmitted: ", this.TotalGTSPPassAdmitted);
    // console.log("this.RemaingGTSPToAdmit: ", this.RemaingGTSPToAdmit);
  }

  getGTPWPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name == 'Glamping Tent with Private Washroom.';
    });

    this.TotalGTPWPasses = totalFestPasses.length;
    this.TotalGTPWPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingGTPWToAdmit = this.TotalGTPWPasses - this.TotalGTPWPassAdmitted;
    
    // console.log("this.TotalGTPWPasses: ", this.TotalGTPWPasses);
    // console.log("this.TotalGTPWPassAdmitted: ", this.TotalGTPWPassAdmitted);
    // console.log("this.RemaingGTPWToAdmit: ", this.RemaingGTPWToAdmit);
  }

  getDeluxPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name === 'Deluxe room near Shoolagiri';
    });

    this.TotalDeluxPasses = totalFestPasses.length;
    this.TotalDeluxPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingDeluxToAdmit = this.TotalDeluxPasses - this.TotalDeluxPassAdmitted;

    // console.log("this.TotalDeluxPasses: ", this.TotalDeluxPasses);
    // console.log("this.TotalDeluxPassAdmitted: ", this.TotalDeluxPassAdmitted);
    // console.log("this.RemaingDeluxToAdmit: ", this.RemaingDeluxToAdmit);
  }

  getCaravanPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name === 'Car/Caravan Pass';
    });

    this.TotalCaravanPasses = totalFestPasses.length;
    this.TotalCaravanPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingCaravanToAdmit = this.TotalCaravanPasses - this.TotalCaravanPassAdmitted;

    // console.log("this.TotalCaravanPasses: ", this.TotalCaravanPasses);
    // console.log("this.TotalCaravanPassAdmitted: ", this.TotalCaravanPassAdmitted);
    // console.log("this.RemaingCaravanToAdmit: ", this.RemaingCaravanToAdmit);
  }

  getEScooterPassCount(data) {
    const totalFestPasses = data.filter(pass => {
      return pass.item_name === 'Ola electric scooter';
    });

    this.TotalEScooterPasses = totalFestPasses.length;
    this.TotalEScooterPassAdmitted = totalFestPasses.filter(pass => pass.isAdmitted).length;
    this.RemaingEScooterToAdmit = this.TotalEScooterPasses - this.TotalEScooterPassAdmitted;
    
    // console.log("this.TotalEScooterPasses: ", this.TotalEScooterPasses);
    // console.log("this.TotalEScooterPassAdmitted: ", this.TotalEScooterPassAdmitted);
    // console.log("this.RemaingEScooterToAdmit: ", this.RemaingEScooterToAdmit);
  }

  createDoughnutChart(): void {
    const ctx = document.getElementById('mainDataChart') as HTMLCanvasElement;
    this.mainChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Festival Admitted', 'Festival Yet To Admit', 'Accomodation Admitted', 'Accomodation Yet To Admit'],
        datasets: [{
          label: 'Festival Ticket Allocated',
          data: [9999, 9999], // Example values for each fruit
          backgroundColor: ['#004d00', '#00cc00'], // Dark green, green, 99ff99light green
          borderWidth: 1
        },
        {
          label: 'Accomodation',
          data: [9999, 9999], // Example values for each fruit
          backgroundColor: ['#FF7B00', '#FFB76B'], // Dark green, green, Dark Orange, LightOrange
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
            display: true, // Enables the title
            text: 'Overall Admission', // Title text
            font: {
              size: 18, // Font size for the title
              weight: 'bold' // Font weight
            },
            padding: {
              top: 10,
              bottom: 30
            },
            align: 'center', // Options: 'start', 'center', 'end'
            color: '#333' // Title color
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

    const ctx4 = document.getElementById('festBarChart') as HTMLCanvasElement;
    this.festBarChart = new Chart(ctx4, {
      type: 'bar',
      data: {
        labels: [ 'Festival Passes', 'Weekend Passes', 'Day Passes'],
        datasets: [
          {
            label: 'Admitted',
            data: [10, 20, 30], // Example values for admitted tickets
            backgroundColor: '#004d00',
            datalabels: {
              color: 'white', // Set label color for Admitted
              anchor: 'center',
              align: 'end',
            },
          },
          {
            label: 'Yet to Admit',
            data: [10, 20, 30], // Example values for yet to admit tickets
            backgroundColor: '#99ff99',
            datalabels: {
              color: 'black', // Set label color for Yet to Admit
              anchor: 'center',
              align: 'end',
            },
          },
        ],
      },
      options: {
        scales: {
          x: {
            stacked: true,
          },
          y: {
            stacked: true,
          },
        },
        plugins: {
          legend: {
            display: true,
          },
          title: {
            display: true, // Enables the title
            text: 'Tenting Data', // Title text
            font: {
              size: 18, // Font size for the title
              weight: 'bold' // Font weight
            },
            padding: {
              top: 10,
              bottom: 30
            },
            align: 'center', // Options: 'start', 'center', 'end'
            color: '#333' // Title color
          }
        },
      },
    }) as Chart<'bar', number[], string>;

    const ctx2 = document.getElementById('accomodationBarChart') as HTMLCanvasElement;
    this.accomBarChart = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: [ 'PYOT', 'Shared Tent', 'Solo Tent',
                  ' Family Tent', 'GTSP', 'GTPW', 'Delux Room'],
        datasets: [
          {
            label: 'Admitted',
            data: [10, 20, 30, 40, 30, 20, 10], // Example values for admitted tickets
            backgroundColor: '#FF7B00',
            datalabels: {
              color: 'white', // Set label color for Admitted
              anchor: 'center',
              align: 'end',
            },
          },
          {
            label: 'Yet to Admit',
            data: [10, 20, 30, 40, 30, 20, 10], // Example values for yet to admit tickets
            backgroundColor: '#FFB76B',
            datalabels: {
              color: 'black', // Set label color for Yet to Admit
              anchor: 'center',
              align: 'end',
            },
          },
        ],
      },
      options: {
        scales: {
          x: {
            stacked: true,
          },
          y: {
            stacked: true,
          },
        },
        plugins: {
          legend: {
            display: true,
          },
          title: {
            display: true, // Enables the title
            text: 'Festival Pass Data', // Title text
            font: {
              size: 18, // Font size for the title
              weight: 'bold' // Font weight
            },
            padding: {
              top: 10,
              bottom: 30
            },
            align: 'center', // Options: 'start', 'center', 'end'
            color: '#333' // Title color
          }
        },
      },
    }) as Chart<'bar', number[], string>;

    const ctx3 = document.getElementById('vehicleBarChart') as HTMLCanvasElement;
    this.vehicleBarChart = new Chart(ctx3, {
      type: 'bar',
      data: {
        labels: [ 'Car/Caravan Pass', 'Electric Scooter'],
        datasets: [
          {
            label: 'Admitted',
            data: [10, 20], // Example values for admitted tickets
            backgroundColor: '#3B1C32',
            datalabels: {
              color: 'white', // Set label color for Admitted
              anchor: 'center',
              align: 'end',
            },
          },
          {
            label: 'Yet to Admit',
            data: [10, 20], // Example values for yet to admit tickets
            backgroundColor: '#A64D79',
            datalabels: {
              color: 'black', // Set label color for Yet to Admit
              anchor: 'center',
              align: 'end',
            },
          },
        ],
      },
      options: {
        scales: {
          x: {
            stacked: true,
          },
          y: {
            stacked: true,
          },
        },
        plugins: {
          legend: {
            display: true,
          },
          title: {
            display: true, // Enables the title
            text: 'Vehicle Admission', // Title text
            font: {
              size: 18, // Font size for the title
              weight: 'bold' // Font weight
            },
            padding: {
              top: 10,
              bottom: 30
            },
            align: 'center', // Options: 'start', 'center', 'end'
            color: '#333' // Title color
          }
        },
      },
    }) as Chart<'bar', number[], string>;

  }

  getDataForMainChart() {
    //const mainChartLablel = ['Festival Ticket Allocated', 'Accomodation'];

    const overallFestAdmitted = this.TotalFestPassAdmitted + this.TotalWeekendPassAdmitted + this.TotalDayPassAdmitted;
    const overallFestRemaining = this.RemaingFestPassToAdmit + this.RemaingWeekendPassToAdmit + this.RemaingDayPassToAdmit;

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
      this.mainChart.data.datasets[0].data = [overallFestAdmitted, overallFestRemaining];
      this.mainChart.data.datasets[1].data = [accomAdmitted, accomRemaining];
      //this.mainChart.data.labels = newLabels;

      // Call the update method to re-render the chart
      this.mainChart.update();
    }
  }

  getDataForFestBarChart() {
    if (this.festBarChart) {
      // Update the data and labels  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      this.festBarChart.data.datasets[0].data = [this.TotalFestPassAdmitted, this.TotalWeekendPassAdmitted, this.TotalDayPassAdmitted];
      this.festBarChart.data.datasets[1].data = [this.RemaingFestPassToAdmit, this.RemaingWeekendPassToAdmit, this.RemaingDayPassToAdmit];
      
      this.festBarChart.update();
    }
  }

  getDataForAccomBarChart() {
    if (this.accomBarChart) {
      // Update the data and labels  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      this.accomBarChart.data.datasets[0].data = [this.TotalPYOTPassAdmitted, this.TotalSharedTPassAdmitted, this.TotalSoloTPassAdmitted, this.TotalFamilyTPassAdmitted, this.TotalGTSPPassAdmitted, this.TotalGTPWPassAdmitted, this.TotalDeluxPassAdmitted];
      this.accomBarChart.data.datasets[1].data = [this.RemaingPYOTtPassToAdmit, this.RemaingSharedTToAdmit, this.RemaingSoloTToAdmit, this.RemaingFamilyTToAdmit, this.RemaingGTSPToAdmit, this.RemaingGTPWToAdmit, this.RemaingDeluxToAdmit];
      
      this.accomBarChart.update();
    }
  }

  getDataForVehicelBarChart() {
    //const mainChartLablel = ['Festival Ticket Allocated', 'Accomodation'];

    if (this.vehicleBarChart) {
      // Update the data and labels  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      this.vehicleBarChart.data.datasets[0].data = [this.TotalCaravanPassAdmitted, this.TotalEScooterPassAdmitted];
      this.vehicleBarChart.data.datasets[1].data = [this.RemaingCaravanToAdmit, this.RemaingEScooterToAdmit];
      
      this.vehicleBarChart.update();
    }
  }

}
