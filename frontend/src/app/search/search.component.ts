import { Component, ViewChild, ElementRef, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

interface Movie {
  id: number;
  title: string;
  overview: string;
  release_year: number;
  similarity: number;
}

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.css'],
})
export class SearchComponent {
  @ViewChild('wordInput') wordInputRef!: ElementRef<HTMLInputElement>;

  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  inputs: string[] = [];
  currentInput = '';
  results: Movie[] = [];
  loading = false;
  error = '';

  addInput(): void {
    const trimmed = this.currentInput.trim();
    if (!trimmed || this.inputs.length >= 5) return;
    this.inputs.push(trimmed);
    this.currentInput = '';
    setTimeout(() => this.wordInputRef?.nativeElement.focus(), 0);
  }

  removeInput(index: number): void {
    this.inputs.splice(index, 1);
  }

  search(): void {
    if (this.inputs.length < 2) return;

    this.loading = true;
    this.error = '';
    this.results = [];

    this.http
      .post<{ results: Movie[] }>(`${environment.apiUrl}/api/search/`, {
        inputs: this.inputs,
      })
      .subscribe({
        next: (res) => {
          console.log('Response:', res);
          this.results = res.results;
          console.log('component results:', this.results);
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error:', err);
          this.error = err?.error?.error || 'Something went wrong. Please try again.';
          this.loading = false;
        },
      });
  }
}