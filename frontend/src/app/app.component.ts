import {Component, HostListener} from '@angular/core';
import {Router, NavigationEnd, RouterOutlet, RouterLinkActive, RouterLink} from '@angular/router';
import {NgForOf, NgIf, NgOptimizedImage, UpperCasePipe} from "@angular/common";
import {TranslateModule, TranslateService} from "@ngx-translate/core";


@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
    imports: [
        RouterOutlet,
        RouterLinkActive,
        RouterLink,
        NgOptimizedImage,
        NgIf,
        TranslateModule,
        NgForOf,
        UpperCasePipe
    ],
  styleUrls: ['./app.component.scss']
})
export class AppComponent  {
  availableLanguages = [
    { code: 'en', label: 'English' },
    { code: 'mk', label: 'Македонски' },
  ];
  getCurrentLanguageCode(): string {
    return this.translate.currentLang.toUpperCase();
  }
  isDropdownOpen = false;


  constructor(private router: Router, public translate: TranslateService) {
    this.translate.addLangs(this.availableLanguages.map(lang => lang.code));
    this.translate.setDefaultLang('en');
    this.translate.use('en');
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        const fragment = this.router.parseUrl(this.router.url).fragment;
        if (fragment && !this.router.url.includes('/referral')) {
          setTimeout(() => this.scrollToSection(fragment), 0);
        }
      }
    });
  }



  toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  selectLanguage(languageCode: string): void {
    this.translate.use(languageCode);
    this.isDropdownOpen = false;
  }


  scrollToSection(section: string): void {
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

  navigateToSection(section: string): void {
    if (section) {
      this.router.navigate(['/'], { fragment: section });
    } else {
      this.router.navigate(['/']);
    }
  }

  checkUserEmail() {
    const userEmail = localStorage.getItem('userEmail');
    return userEmail !== null && userEmail.trim() !== '';
  }

  logOut() {
    localStorage.removeItem('userEmail');  // Optionally clear localStorage as well
    this.router.navigate(['/']);
  }

  isMenuActive = false;

  toggleMenu() {
    this.isMenuActive = !this.isMenuActive;
    const menuToggleButton = document.querySelector('.menu-toggle');
    const navElement = document.querySelector('nav');
    if (menuToggleButton && navElement) {
      menuToggleButton.classList.toggle('active', this.isMenuActive);
      navElement.classList.toggle('active', this.isMenuActive);
    }
  }

  @HostListener('document:click', ['$event'])
  onClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const dropdown = document.querySelector('.language-dropdown') as HTMLElement;
    const menuToggleButton = document.querySelector('.menu-toggle') as HTMLElement;
    const navElement = document.querySelector('nav') as HTMLElement;

    const clickedInsideDropdown = dropdown && dropdown.contains(target);
    const clickedInsideLanguageSelector = document.querySelector('.selected-language')?.contains(target);
    const clickedInsideMenuButton = menuToggleButton && menuToggleButton.contains(target);
    const clickedInsideNav = navElement && navElement.contains(target);

    if (!clickedInsideDropdown && !clickedInsideLanguageSelector) {
      this.isDropdownOpen = false; // Close the language dropdown
    }

    if (!clickedInsideNav && !clickedInsideMenuButton) {
      this.isMenuActive = false;
      const menuToggleButtonElement = document.querySelector('.menu-toggle');
      const navElement = document.querySelector('nav');

      // Remove 'active' class from the button and nav
      if (menuToggleButtonElement) {
        menuToggleButtonElement.classList.remove('active');
      }
      if (navElement) {
        navElement.classList.remove('active');
      }
    }
  }}
