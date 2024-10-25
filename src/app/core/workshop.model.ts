export class Workshop {
    public workshopName: string;
    public workshopVenue: string;
    public startsAt: string;
    public registrationTime: string;
    public workshopImage?: FormData
    

    constructor(workshopName: string, workshopVenue: string, startsAt: string, registrationTime: string, imagePath: FormData) {
        this.workshopName = workshopName;
        this.workshopVenue = workshopVenue;
        this.startsAt = startsAt;
        this.registrationTime = registrationTime;
        this.workshopImage = imagePath;
    }
}
