import {AfterViewInit, Component, OnInit} from '@angular/core';
import {JsonPipe, NgClass, NgForOf, NgIf, NgOptimizedImage, NgStyle} from '@angular/common';
import {NavigationEnd, Router, RouterLink} from '@angular/router';
import {TranslatePipe} from "@ngx-translate/core";

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: './home.component.html',
  imports: [
    NgStyle,
    RouterLink,
    NgForOf,
    NgIf,
    NgOptimizedImage,
    NgClass,
    TranslatePipe,
    JsonPipe,
  ],
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, AfterViewInit {
  constructor(private router: Router) {
  }

  ngOnInit(): void {
    this.handleFragment();
  }

  ngAfterViewInit(): void {
    this.handleFragment();
  }

  private handleFragment(): void {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        const fragment = this.router.parseUrl(this.router.url).fragment;
        if (fragment) {
          setTimeout(() => this.scrollToSection(fragment), 0);
        }
      }
    });
  }

  private scrollToSection(section: string): void {
    const element = document.getElementById(section);
    if (element) {
      const headerOffset = document.querySelector('header')?.clientHeight || 0;
      const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
      const offsetPosition = elementPosition - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  }


  faqs = [
    {
      question: 'FAQ_WHAT_IS_THE_PRODUCT',
      answer: 'FAQ_ANSWER_WHAT_IS_THE_PRODUCT',
      open: false
    },
    {
      question: 'FAQ_WHERE_CAN_I_USE_THE_PRODUCT',
      answer: 'FAQ_ANSWER_WHERE_CAN_I_USE_THE_PRODUCT',
      open: false
    },
    {
      question: 'FAQ_WHAT_IS_INCLUDED',
      answer: 'FAQ_ANSWER_WHAT_IS_INCLUDED',
      open: false
    },
    {
      question: 'FAQ_WHEN_CAN_I_START_USING_THE_PRODUCT',
      answer: 'FAQ_ANSWER_WHEN_CAN_I_START_USING_THE_PRODUCT',
      open: false
    },
    {
      question: 'FAQ_CAN_I_BUY_MORE_PRODUCTS',
      answer: 'FAQ_ANSWER_CAN_I_BUY_MORE_PRODUCTS',
      open: false
    },
    {
      question: 'FAQ_IS_THERE_A_TRIAL_PERIOD',
      answer: 'FAQ_ANSWER_IS_THERE_A_TRIAL_PERIOD',
      open: false
    }
  ];




  toggleFaq(faq: any) {
    faq.open = !faq.open;
  }
}
