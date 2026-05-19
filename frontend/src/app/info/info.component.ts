import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-info',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './info.component.html',
    styleUrl: './info.component.css'
})
export class InfoComponent implements OnInit {
    isVisible = false;
    neverShowAgain = false;

    ngOnInit() {
        if (typeof window !== 'undefined') {
            const hideModal = localStorage.getItem('hideGraphInfoModal');
            if (hideModal !== 'true') {
                this.isVisible = true;
            }
        } else {
            // In SSR context, default to true or false. Better to false to avoid flashes.
            this.isVisible = false;
        }
    }

    closeModal() {
        this.isVisible = false;
        if (this.neverShowAgain && typeof window !== 'undefined') {
            localStorage.setItem('hideGraphInfoModal', 'true');
        }
    }

    openModal() {
        this.isVisible = true;
    }
}