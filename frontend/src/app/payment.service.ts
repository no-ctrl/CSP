import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import {environment} from "../environments/environment";
@Injectable({
  providedIn: 'root',
})
export class PaymentService {

  private apiUrl = environment.apiUrl;


  constructor(private http: HttpClient) {
  }

  getWalletDetails(crypto: string, userId: string, total: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/payment-details`, {
      params: { crypto, userId, total: total.toString() }
    });
  }

  checkPaymentStatus(crypto: string, amount: string, userId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/check-payment`, {
      crypto,
      amount,
      userId
    });
  }

}
