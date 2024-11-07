import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'utcToLocalTime'
})
export class UtcToLocalTimePipe implements PipeTransform {

  transform(value: string): string {
    var browserLanguage = navigator.language;
    let date = new Date(value).toLocaleDateString(browserLanguage);
    let time = new Date(value).toLocaleTimeString(browserLanguage);

    return `${date}, ${time}`;
  }

}
