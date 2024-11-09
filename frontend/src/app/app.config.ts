import { provideRouter } from '@angular/router';
import {HttpClient, provideHttpClient} from '@angular/common/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HomeComponent } from './home/home.component';
import {PaymentComponent} from './payment/payment.component';
import {HelpGuideComponent} from "./help-guide/help-guide.component";
import {TncComponent} from "./tnc/tnc.component";
import {importProvidersFrom} from "@angular/core";
import {TranslateLoader, TranslateModule} from "@ngx-translate/core";
import {TranslateHttpLoader} from "@ngx-translate/http-loader";

const httpLoaderFactory: (http: HttpClient) => TranslateHttpLoader = (http: HttpClient) =>
     new TranslateHttpLoader(http, './assets/i18n/', '.json');
export const appConfig = {
  providers: [
    provideRouter([
      { path: '', component: HomeComponent },
      { path: 'offers', component: PaymentComponent },
      {path: 'terms-and-conditions', component: TncComponent},
      {path: 'help',component: HelpGuideComponent},
      { path: '**', redirectTo: '' }
    ]),
    importProvidersFrom([TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: httpLoaderFactory,
        deps: [HttpClient],
      },
    })]),
    provideHttpClient(),
    BrowserAnimationsModule
  ]
};
