import { Component, OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject, debounceTime, Subject, catchError, takeUntil } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { CurrencyPipe, DecimalPipe, NgForOf, NgIf } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { QRCodeModule } from 'angularx-qrcode';
import { PaymentService } from '../payment.service';
import { Router } from '@angular/router';
import {environment} from "../../environments/environment";
import {TranslatePipe} from "@ngx-translate/core";

@Component({
  selector: 'app-payment',
  standalone: true,
  templateUrl: './payment.component.html',
    imports: [
        NgForOf,
        NgIf,
        FormsModule,
        ReactiveFormsModule,
        QRCodeModule,
        CurrencyPipe,
        DecimalPipe,
        TranslatePipe
    ],
  styleUrls: ['./payment.component.scss']
})
export class PaymentComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private cryptoPackageSubject = new BehaviorSubject<{ packageName: string | null; cryptoName: string | null; amount: number }>({ packageName: null, cryptoName: null, amount: 0 });

  transactionForm: FormGroup;
  emailForm: FormGroup;

  cryptoOptions = [
    { name: 'Bitcoin', logo: '/assets/bitcoin-logo.svg' },
    { name: 'Ethereum', logo: '/assets/ethereum-logo.svg' },
    { name: 'USDT', logo: '/assets/usdt-logo.svg' },
    { name: 'BNB', logo: '/assets/bnb-logo.svg' },
    { name: 'Litecoin', logo: '/assets/litecoin-logo.svg' },

  ];

  packages = [
    { name: 'Product 1', description: 'PRODUCT_1_DESCRIPTION', price: '9.99', discount: '' },
    { name: 'Product 2', description: 'PRODUCT_2_DESCRIPTION', price: '19.99', discount: '' },
    { name: 'Product 3', description: 'PRODUCT_3_DESCRIPTION', price: '29.99', discount: 'PRODUCT_3_DISCOUNT' }
  ];

  totalAmountRequired: string | null = null;
  selectedPackage: string | null = null;
  selectedCrypto: string | null = null;
  cryptoAddress = '';
  cryptoAmountRequired: number | null = 0;
  progress = 0;
  paymentCompleted = false;
  paymentToken: string | null = null;
  paymentStarted = false;
  userEmail = '';
  emailSubmitted = false;
  qrData = '';
  amountPaid: number | null = null;

  // WebSocket and Prices
  ws: WebSocket | null = null;
  private userId: string | null = null;
  private prices: { [key: string]: number } = {};
  private retryAttempts = 0;
  private maxRetries = 5;

  constructor(
    private http: HttpClient,
    private paymentService: PaymentService,
    private fb: FormBuilder,
    private router: Router
  ) {
    this.transactionForm = this.fb.group({
      transactionIds: this.fb.array([''])
    });

    this.emailForm = this.fb.group({
      userEmail: ['', [Validators.required, Validators.email]]
    });
  }

  ngOnInit() {
    this.initializeUserId();
    this.initializeEmail();
    this.initializeCryptoPackageSubscription();
    const now = new Date();
    this.utcDate = now.toUTCString();
  }


  private setupWebSocket() {
    if (!this.ws && this.selectedCrypto && this.totalAmountRequired && this.userId) {
      this.ws = new WebSocket(environment.websocketUrl); // Adjust URL if needed

      this.ws.onopen = () => {
        console.log('WebSocket connection established.');
        this.retryAttempts = 0;
        this.ws?.send(JSON.stringify({
          crypto: this.selectedCrypto,
          amount: this.totalAmountRequired,
          userId: this.userEmail
        }));
      };

      this.ws.onmessage = (event) => {
        const response = JSON.parse(event.data);
        if (response.error) {
          console.error('Payment Error:', response.error);
        } else if (response.paymentCompleted) {
          this.paymentCompleted = true;
          this.paymentToken = response.uniqueCode;
          this.progress = 100;
          this.amountPaid = response.amountPaid;
          this.ws?.close();
        } else {
          this.amountPaid = response.amountPaid;
          this.updateProgress();
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.handleWebSocketError(error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket connection closed.');
        if (!this.paymentCompleted && this.retryAttempts < this.maxRetries) {
          this.retryAttempts++;
          setTimeout(() => this.setupWebSocket(), 30000); // Retry after 30 seconds
        } else {
          this.ws = null;
        }
      };
    }
  }

  private updateProgress() {
    if (this.amountPaid !== null && this.totalAmountRequired !== null) {
      const totalAmount = parseFloat(this.totalAmountRequired.toString());
      const amountPaid = parseFloat(this.amountPaid.toString());

      if (!isNaN(totalAmount) && !isNaN(amountPaid) && totalAmount > 0) {
        this.progress = (amountPaid / totalAmount) * 100;
      } else {
        console.error('Invalid values for amountPaid or totalAmountRequired.');
      }
    } else {
      console.error('amountPaid or totalAmountRequired is null.');
    }
  }

  private handleWebSocketError(error: Event) {
    alert('WebSocket connection error. Please try again. Details: ' + error.type);
  }


  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.ws) {
      this.ws.close(1000, '');
      this.ws = null;
    }
  }
  get remainingAmount(): number {
    let requiredAmount = Number(this.totalAmountRequired);
    let paidAmount = Number(this.amountPaid);
    return requiredAmount-paidAmount;
  }

  private initializeUserId() {
    this.userId = localStorage.getItem('userId') || this.generateUserId();
    localStorage.setItem('userId', this.userId);
  }

  private generateUserId(): string {
    return `user_${Math.random().toString(36).substr(2, 9)}`;
  }
  private resetPaymentState() {
    this.amountPaid = 0;
    this.progress = 0;
    this.paymentStarted = false;
    this.paymentCompleted = false;
    this.paymentToken = null;
    this.ws?.close();
    this.ws = null;
  }
  private initializeEmail() {
    const storedEmail = localStorage.getItem('userEmail');
    if (storedEmail) {
      this.userEmail = storedEmail;
      this.emailSubmitted = true;
      this.emailForm.get('userEmail')?.setValue(storedEmail);
    }
  }


  utcDate: any;
  private initializeCryptoPackageSubscription() {
    this.cryptoPackageSubject
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.selectedPackage = data.packageName;
        this.selectedCrypto = data.cryptoName;
        this.cryptoAmountRequired = data.amount;
        this.updateWalletDetails();
      });
  }

  onPackageClick(packageName: string) {
    this.selectedPackage = packageName;
    this.updateWalletDetails();
  }

  onCryptoClick(cryptoName: string) {
    this.resetPaymentState();

    this.selectedCrypto = cryptoName;
    this.updateWalletDetails();

    if (this.paymentStarted) {
      this.setupWebSocket();
      this.checkPaymentStatus();
    }
  }

  private updateWalletDetails() {
    if (this.selectedCrypto && this.selectedPackage) {
      const total = this.getPackagePrice(this.selectedPackage);

      if (total !== undefined) {
        this.totalAmountRequired = total.toString();
        this.getWalletDetails(this.selectedCrypto, this.userEmail || this.userId || '', total.toString());
      }
    }
  }

  private getPackagePrice(packageName: string): number | undefined {
    const selectedPackage = this.packages.find(pkg => pkg.name === packageName);
    return selectedPackage ? parseFloat(selectedPackage.price) : undefined;
  }

  private getWalletDetails(crypto: string, userId: string, total: string) {
    this.paymentService.getWalletDetails(crypto, userId, total).pipe(
      catchError(err => {
        console.error('Error fetching wallet details:', err);
        return [];
      }),
      takeUntil(this.destroy$)
    ).subscribe(response => {
      this.cryptoAddress = response.address;
      this.prices[crypto] = response.price;

      const packagePrice = this.getPackagePrice(this.selectedPackage || '');
      this.cryptoAmountRequired = packagePrice ? packagePrice / response.price : null;

      this.updateQrCodeData();
      this.updateProgress()
    });
  }


  updateQrCodeData() {
    if (!this.selectedCrypto || !this.cryptoAddress || !this.cryptoAmountRequired) {
      this.qrData = '';
      return;
    }

    const amount = encodeURIComponent(this.cryptoAmountRequired.toString());
    const address = encodeURIComponent(this.cryptoAddress);

    switch (this.selectedCrypto) {
      case 'Bitcoin':
        this.qrData = `bitcoin:${address}?amount=${amount}`;
        break;
      case 'Ethereum':
        this.qrData = `ethereum:${address}?amount=${amount}`;
        break;
      case 'Litecoin':
        this.qrData = `litecoin:${address}?amount=${amount}`;
        break;
      case 'BNB':
        this.qrData = `${address}?amount=${amount}`;
        break;
      default:
        this.qrData = '';
    }
  }

  protected checkPaymentStatus() {
    this.paymentStarted = true;
    this.setupWebSocket();

    if (this.totalAmountRequired && this.userEmail && this.selectedCrypto) {
      this.paymentService.checkPaymentStatus(this.selectedCrypto, this.totalAmountRequired, this.userEmail).pipe(
        debounceTime(5000),
        catchError(err => {
          console.error('Error checking payment status:', err);
          return [];
        }),
        takeUntil(this.destroy$)
      ).subscribe(response => {
        if (response.paymentCompleted) {
          this.paymentCompleted = true;
          this.paymentToken = response.uniqueCode;
          this.amountPaid = response.amountPaid;
          this.updateProgress();
        }
      });
    }
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
    }).catch(err => {
      console.error('Failed to copy text to clipboard', err);
    });
  }

  onEmailSubmit() {
    if (this.emailForm.valid) {
      this.userEmail = this.emailForm.get('userEmail')?.value;
      localStorage.setItem('userEmail', this.userEmail);
      this.emailSubmitted = true;
    }
  }

}
